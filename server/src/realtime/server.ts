/**
 * Socket.IO wiring: the only place that talks to the network. Every
 * client request goes through the ack-callback pattern
 * `(payload, cb) => cb({ ok: true, ...data } | { ok: false, error })` so
 * the client always gets a definite answer instead of guessing from side
 * effects. Room/match *logic* lives in rooms.ts and views.ts - this file
 * only: (1) validates raw payload shape at the boundary, (2) calls into
 * that logic, (3) turns the result into an ack + broadcasts.
 *
 * Server is authoritative, client is never trusted: nothing here ever
 * accepts board contents, turn order, or win state from the client beyond
 * "here's the number I'm calling" - the engine (via rooms.ts) re-validates
 * everything.
 */

import { randomUUID } from "node:crypto";
import type { Server as NodeHttpServer } from "node:http";
import { Server, type Socket } from "socket.io";
import { verifyMessage, type Address, type Hex } from "viem";

import type {
  Ack,
  ClientToServerEvents,
  DraftSubmitPayload,
  EmptyAckData,
  LoadoutSetPayload,
  LobbyAckData,
  MatchCallAckData,
  MatchCallPayload,
  RoomCreatePayload,
  RoomJoinPayload,
  RoomJoinedAckData,
  ServerToClientEvents,
  WalletLinkAckData,
  WalletLinkPayload,
  WalletNonceAckData,
} from "../api/protocol.ts";
import { recordEvent } from "../api/questStore.ts";
import type { MatchState } from "../engine/index.ts";
import { eventsFromCall } from "../quest/events.ts";
import {
  assertCanSetLoadout,
  callNumberInRoom,
  createRoom,
  exitRoom,
  getRoom,
  joinRoom,
  MAX_LOADOUT_SIZE,
  type Room,
  type RoomMode,
  setPlayerLoadout,
  setPlayerWallet,
  startDraft,
  submitBoard,
} from "./rooms.ts";
import { lobbyView, matchViewFor } from "./views.ts";

const MAX_NICKNAME_LENGTH = 24;
const MAX_ROOM_CODE_LENGTH = 12;
/** ~5 minutes - long enough for a wallet popup, short enough to bound replay risk. */
const WALLET_NONCE_TTL_MS = 5 * 60 * 1000;

/**
 * A thin, injectable stand-in for chain/reader.ts's `verifyLoadout` -
 * deliberately NOT importing viem's PublicClient or anything chain-specific
 * here so the realtime layer never hard-wires a real chain connection (unit
 * tests inject a mock; production wiring - reading env/deployments and
 * building a real viem client - lives in chain/defaultVerifier.ts and is
 * wired in from index.ts). Structurally compatible with chain/reader.ts's
 * `verifyLoadout` return shape, so a real one can be passed in as-is.
 */
export type LoadoutVerifier = (
  owner: string,
  skillIds: readonly number[],
) => Promise<{ readonly valid: boolean; readonly reason?: string }>;

export interface RealtimeServerOptions {
  /**
   * Verifies a candidate loadout against on-chain ownership. When absent,
   * "standard" mode rooms (which require it) are rejected at room:create
   * with a clear "chain belum dikonfigurasi" error - see index.ts for the
   * production default (chain/defaultVerifier.ts).
   */
  readonly verifyLoadout?: LoadoutVerifier;
}

// -- wire types ---------------------------------------------------------
//
// ClientToServerEvents/ServerToClientEvents come from ../api/protocol.ts -
// the ONE typed contract shared with FE (see server/package.json's
// "./protocol" export). `new Server<ClientToServerEvents,
// ServerToClientEvents>(...)` below means any mismatch between what a
// handler actually sends/expects and what protocol.ts declares is a
// compile error here, not a runtime surprise for FE.

interface PendingWalletNonce {
  readonly nonce: string;
  readonly message: string;
  readonly issuedAt: number;
}

interface SocketData {
  roomCode?: string;
  playerId?: string;
  /** Linked wallet address (lowercased) - may be set before joining a room. */
  walletAddress?: string;
  /** Last-issued, not-yet-consumed nonce for this socket - see wallet:nonce/wallet:link. */
  walletNonce?: PendingWalletNonce;
}

type RealtimeServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
type RealtimeSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

// -- boundary validation --------------------------------------------------
// Deliberately minimal: shape/type checks only, so a bad payload never
// throws an uncaught TypeError. Semantic validation (board legality, turn
// order, duplicate calls, ...) stays in the engine/rooms.ts, which already
// does it and returns clear error messages.

function validateNickname(value: unknown): string {
  if (typeof value !== "string") throw new Error("nickname must be a string");
  const trimmed = value.trim();
  if (trimmed.length === 0) throw new Error("nickname must not be empty");
  if (trimmed.length > MAX_NICKNAME_LENGTH) {
    throw new Error(`nickname must be at most ${MAX_NICKNAME_LENGTH} characters`);
  }
  return trimmed;
}

function validateRoomCode(value: unknown): string {
  if (typeof value !== "string") throw new Error("code must be a string");
  const trimmed = value.trim().toUpperCase();
  if (trimmed.length === 0 || trimmed.length > MAX_ROOM_CODE_LENGTH) {
    throw new Error("code is not a valid room code");
  }
  return trimmed;
}

function validateNumbersArray(value: unknown): number[] {
  if (!Array.isArray(value)) throw new Error("numbers must be an array");
  const numbers: number[] = [];
  for (const entry of value) {
    if (typeof entry !== "number") throw new Error("numbers must contain only numbers");
    numbers.push(entry);
  }
  return numbers;
}

function validateCalledNumber(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error("number must be a finite number");
  }
  return value;
}

function validateRoomMode(value: unknown): RoomMode {
  if (value === undefined) return "casual";
  if (value === "casual" || value === "standard") return value;
  throw new Error('mode must be "casual" or "standard"');
}

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const HEX_RE = /^0x[0-9a-fA-F]+$/;

function validateWalletAddress(value: unknown): Address {
  if (typeof value !== "string" || !ADDRESS_RE.test(value)) {
    throw new Error("address must be a 0x-prefixed 20-byte hex address");
  }
  return value as Address;
}

function validateSignature(value: unknown): Hex {
  if (typeof value !== "string" || !HEX_RE.test(value)) {
    throw new Error("signature must be a 0x-prefixed hex string");
  }
  return value as Hex;
}

/** array of 0..MAX_LOADOUT_SIZE unique positive integers - shape-level only, ownership/active checks happen on-chain. */
function validateSkillIdsArray(value: unknown): number[] {
  if (!Array.isArray(value)) throw new Error("skillIds must be an array");
  if (value.length > MAX_LOADOUT_SIZE) {
    throw new Error(`skillIds must contain at most ${MAX_LOADOUT_SIZE} entries`);
  }
  const seen = new Set<number>();
  const skillIds: number[] = [];
  for (const entry of value) {
    if (typeof entry !== "number" || !Number.isInteger(entry) || entry < 1) {
      throw new Error("skillIds must contain only positive integers");
    }
    if (seen.has(entry)) throw new Error("skillIds must not contain duplicates");
    seen.add(entry);
    skillIds.push(entry);
  }
  return skillIds;
}

/**
 * Wraps a handler so a bad/unexpected payload (wrong shape despite what the
 * protocol type promises, missing ack, or a thrown Error / rejected Promise
 * from downstream logic - including async ones like the chain-backed
 * loadout:set) always turns into `ack({ ok: false, error })` instead of an
 * uncaught exception - Socket.IO event listeners don't catch throws (sync
 * or async) for you, and one bad payload should never take the whole server
 * down. `P`/`R` tie this to the exact payload/ack-data types protocol.ts
 * declares for the event being wrapped.
 */
function safeHandler<P, R>(
  handler: (payload: P, ack: Ack<R>) => void | Promise<void>,
): (payload: P, ack: Ack<R>) => void {
  return (payload, ack) => {
    const send: Ack<R> = typeof ack === "function" ? ack : (() => {}) as Ack<R>;
    Promise.resolve()
      .then(() => handler(payload, send))
      .catch((err: unknown) => {
        send({ ok: false, error: err instanceof Error ? err.message : "Unexpected server error" });
      });
  };
}

// -- channels ---------------------------------------------------------

function roomChannel(code: string): string {
  return `room:${code}`;
}

function playerChannel(playerId: string): string {
  return `player:${playerId}`;
}

function joinSocketToRoom(socket: RealtimeSocket, code: string, playerId: string): void {
  socket.data.roomCode = code;
  socket.data.playerId = playerId;
  socket.join(roomChannel(code));
  socket.join(playerChannel(playerId));
}

function clearSocketRoom(socket: RealtimeSocket): void {
  const { roomCode, playerId } = socket.data;
  if (roomCode) socket.leave(roomChannel(roomCode));
  if (playerId) socket.leave(playerChannel(playerId));
  socket.data.roomCode = undefined;
  socket.data.playerId = undefined;
}

function requireSocketRoom(socket: RealtimeSocket): { roomCode: string; playerId: string } {
  const { roomCode, playerId } = socket.data;
  if (!roomCode || !playerId) throw new Error("Not currently in a room");
  return { roomCode, playerId };
}

// -- broadcasts ---------------------------------------------------------

function broadcastLobby(io: RealtimeServer, room: Room): void {
  io.to(roomChannel(room.code)).emit("room:state", lobbyView(room));
}

/** match:state is per-viewer (own board only), so it can't be a single room-wide emit. */
function broadcastMatchState(io: RealtimeServer, room: Room): void {
  const socketIds = io.sockets.adapter.rooms.get(roomChannel(room.code));
  if (!socketIds) return;

  for (const socketId of socketIds) {
    const socket = io.sockets.sockets.get(socketId);
    const playerId = socket?.data.playerId;
    if (!socket || !playerId) continue;

    const view = matchViewFor(room, playerId);
    if (view) socket.emit("match:state", view);
  }
}

/**
 * Shared tail end of "a player is gone from this room", used by both
 * room:leave (deliberate) and the socket disconnect handler - exitRoom
 * already unifies the state-transition rule for both (see rooms.ts), this
 * just turns that into the matching broadcasts.
 */
function applyExitResult(
  io: RealtimeServer,
  roomCode: string,
  result: { room: Room | undefined; matchAborted: boolean },
  reason: string,
): void {
  if (result.matchAborted) {
    io.to(roomChannel(roomCode)).emit("match:ended", { winnerId: null, reason });
  }
  if (result.room) broadcastLobby(io, result.room);
}

// -- quest progress -----------------------------------------------------
//
// Progress itself lives in ../api/questStore.ts, shared with the HTTP API's
// GET /quests/progress/:playerId - this is just the realtime-side glue that
// turns a match transition into events and broadcasts newly-completed quests.

function processQuestEvents(io: RealtimeServer, prevMatch: MatchState, nextMatch: MatchState): void {
  const events = eventsFromCall(prevMatch, nextMatch);
  if (events.length === 0) return;

  const dateISO = new Date().toISOString().slice(0, 10);
  for (const event of events) {
    const result = recordEvent(event, dateISO);
    for (const quest of result.completed) {
      io.to(playerChannel(event.playerId)).emit("quest:completed", { questId: quest.id, title: quest.title });
    }
  }
}

// -- server ---------------------------------------------------------

export function createRealtimeServer(httpServer: NodeHttpServer, opts: RealtimeServerOptions = {}): RealtimeServer {
  const io: RealtimeServer = new Server(httpServer, {
    cors: { origin: "*" },
  });
  const verifyLoadout = opts.verifyLoadout;

  io.on("connection", (socket) => {
    socket.on(
      "room:create",
      safeHandler<RoomCreatePayload, RoomJoinedAckData>((payload, ack) => {
        const nickname = validateNickname(payload?.nickname);
        const mode = validateRoomMode(payload?.mode);
        if (mode === "standard" && !verifyLoadout) {
          throw new Error('Chain belum dikonfigurasi - mode "standard" tidak tersedia');
        }
        const { room, playerId } = createRoom(nickname, { mode, wallet: socket.data.walletAddress });
        joinSocketToRoom(socket, room.code, playerId);
        ack({ ok: true, code: room.code, playerId, view: lobbyView(room) });
      }),
    );

    socket.on(
      "room:join",
      safeHandler<RoomJoinPayload, RoomJoinedAckData>((payload, ack) => {
        const code = validateRoomCode(payload?.code);
        const nickname = validateNickname(payload?.nickname);
        const { room, playerId } = joinRoom(code, nickname, { wallet: socket.data.walletAddress });
        joinSocketToRoom(socket, room.code, playerId);
        ack({ ok: true, code: room.code, playerId, view: lobbyView(room) });
        broadcastLobby(io, room);
      }),
    );

    socket.on(
      "wallet:nonce",
      safeHandler<EmptyAckData, WalletNonceAckData>((_payload, ack) => {
        const nonce = randomUUID();
        const message = `TheBingoFi wallet link\nnonce: ${nonce}`;
        socket.data.walletNonce = { nonce, message, issuedAt: Date.now() };
        ack({ ok: true, nonce, message });
      }),
    );

    socket.on(
      "wallet:link",
      safeHandler<WalletLinkPayload, WalletLinkAckData>(async (payload, ack) => {
        const address = validateWalletAddress(payload?.address);
        const signature = validateSignature(payload?.signature);

        const pending = socket.data.walletNonce;
        if (!pending) throw new Error("No nonce requested yet - call wallet:nonce first");
        if (Date.now() - pending.issuedAt > WALLET_NONCE_TTL_MS) {
          socket.data.walletNonce = undefined;
          throw new Error("Nonce expired - call wallet:nonce again");
        }

        const isValid = await verifyMessage({ address, message: pending.message, signature });
        if (!isValid) throw new Error("Signature does not match address for the issued nonce");

        // Single-use: only consumed on success, so a failed attempt (e.g. a
        // typo'd signature) can be retried against the same nonce - see
        // server/API.md's "Wallet link" section.
        socket.data.walletNonce = undefined;
        const linkedAddress = address.toLowerCase();
        socket.data.walletAddress = linkedAddress;
        ack({ ok: true, address: linkedAddress });

        const { roomCode, playerId } = socket.data;
        if (roomCode && playerId) {
          const room = getRoom(roomCode);
          if (room) {
            setPlayerWallet(room, playerId, linkedAddress);
            broadcastLobby(io, room);
          }
        }
      }),
    );

    socket.on(
      "loadout:set",
      safeHandler<LoadoutSetPayload, LobbyAckData>(async (payload, ack) => {
        const ctx = requireSocketRoom(socket);
        const skillIds = validateSkillIdsArray(payload?.skillIds);

        const room = getRoom(ctx.roomCode);
        if (!room) throw new Error(`Room ${ctx.roomCode} not found`);

        const player = assertCanSetLoadout(room, ctx.playerId);
        if (!verifyLoadout) {
          throw new Error('Chain belum dikonfigurasi - mode "standard" tidak tersedia');
        }

        const verification = await verifyLoadout(player.wallet!, skillIds);
        if (!verification.valid) {
          ack({ ok: false, error: verification.reason ?? "Loadout is not valid for this wallet" });
          return;
        }

        setPlayerLoadout(room, ctx.playerId, skillIds);
        ack({ ok: true, view: lobbyView(room) });
        broadcastLobby(io, room);
      }),
    );

    socket.on(
      "room:leave",
      safeHandler<EmptyAckData, EmptyAckData>((_payload, ack) => {
        const ctx = requireSocketRoom(socket);
        const result = exitRoom(ctx.roomCode, ctx.playerId);
        clearSocketRoom(socket);
        ack({ ok: true });
        applyExitResult(io, ctx.roomCode, result, "player_left");
      }),
    );

    socket.on(
      "draft:start",
      safeHandler<EmptyAckData, LobbyAckData>((_payload, ack) => {
        const ctx = requireSocketRoom(socket);
        const room = startDraft(ctx.roomCode, ctx.playerId);
        ack({ ok: true, view: lobbyView(room) });
        broadcastLobby(io, room);
      }),
    );

    socket.on(
      "draft:submit",
      safeHandler<DraftSubmitPayload, LobbyAckData>((payload, ack) => {
        const ctx = requireSocketRoom(socket);
        const numbers = validateNumbersArray(payload?.numbers);
        const room = submitBoard(ctx.roomCode, ctx.playerId, numbers);
        ack({ ok: true, view: lobbyView(room) });
        broadcastLobby(io, room);
        if (room.phase === "playing") broadcastMatchState(io, room);
      }),
    );

    socket.on(
      "match:call",
      safeHandler<MatchCallPayload, MatchCallAckData>((payload, ack) => {
        const ctx = requireSocketRoom(socket);
        const number = validateCalledNumber(payload?.number);

        const room = getRoom(ctx.roomCode);
        if (!room) throw new Error(`Room ${ctx.roomCode} not found`);
        const prevMatch = room.match;

        const result = callNumberInRoom(ctx.roomCode, ctx.playerId, number);
        if (!result.ok || !result.room) {
          ack({ ok: false, error: result.error ?? "Unknown error" });
          return;
        }

        const updatedRoom = result.room;
        const view = matchViewFor(updatedRoom, ctx.playerId);
        if (!view) {
          // Unreachable in practice: callNumberInRoom only succeeds when
          // updatedRoom has a match and ctx.playerId is one of its players,
          // which is exactly what matchViewFor needs to return a view.
          ack({ ok: false, error: "Match state unavailable" });
          return;
        }
        ack({ ok: true, view });
        broadcastMatchState(io, updatedRoom);

        if (prevMatch && updatedRoom.match) {
          processQuestEvents(io, prevMatch, updatedRoom.match);
        }

        if (updatedRoom.match?.status === "finished") {
          io.to(roomChannel(ctx.roomCode)).emit("match:ended", { winnerId: updatedRoom.match.winnerId ?? null });
        }
      }),
    );

    socket.on("disconnect", () => {
      const { roomCode, playerId } = socket.data;
      if (!roomCode || !playerId) return;

      const result = exitRoom(roomCode, playerId);
      applyExitResult(io, roomCode, result, "player_disconnected");
    });
  });

  return io;
}

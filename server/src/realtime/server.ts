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

import type { Server as NodeHttpServer } from "node:http";
import { Server, type Socket } from "socket.io";

import type {
  Ack,
  ClientToServerEvents,
  DraftSubmitPayload,
  EmptyAckData,
  LobbyAckData,
  MatchCallAckData,
  MatchCallPayload,
  RoomCreatePayload,
  RoomJoinPayload,
  RoomJoinedAckData,
  ServerToClientEvents,
} from "../api/protocol.ts";
import { recordEvent } from "../api/questStore.ts";
import type { MatchState } from "../engine/index.ts";
import { eventsFromCall } from "../quest/events.ts";
import {
  callNumberInRoom,
  createRoom,
  exitRoom,
  getRoom,
  joinRoom,
  type Room,
  startDraft,
  submitBoard,
} from "./rooms.ts";
import { lobbyView, matchViewFor } from "./views.ts";

const MAX_NICKNAME_LENGTH = 24;
const MAX_ROOM_CODE_LENGTH = 12;

// -- wire types ---------------------------------------------------------
//
// ClientToServerEvents/ServerToClientEvents come from ../api/protocol.ts -
// the ONE typed contract shared with FE (see server/package.json's
// "./protocol" export). `new Server<ClientToServerEvents,
// ServerToClientEvents>(...)` below means any mismatch between what a
// handler actually sends/expects and what protocol.ts declares is a
// compile error here, not a runtime surprise for FE.

interface SocketData {
  roomCode?: string;
  playerId?: string;
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

/**
 * Wraps a handler so a bad/unexpected payload (wrong shape despite what the
 * protocol type promises, missing ack, or a thrown Error from downstream
 * logic) always turns into `ack({ ok: false, error })` instead of an
 * uncaught exception - Socket.IO event listeners don't catch synchronous
 * throws for you, and one bad payload should never take the whole server
 * down. `P`/`R` tie this to the exact payload/ack-data types protocol.ts
 * declares for the event being wrapped.
 */
function safeHandler<P, R>(handler: (payload: P, ack: Ack<R>) => void): (payload: P, ack: Ack<R>) => void {
  return (payload, ack) => {
    const send: Ack<R> = typeof ack === "function" ? ack : (() => {}) as Ack<R>;
    try {
      handler(payload, send);
    } catch (err) {
      send({ ok: false, error: err instanceof Error ? err.message : "Unexpected server error" });
    }
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

export function createRealtimeServer(httpServer: NodeHttpServer): RealtimeServer {
  const io: RealtimeServer = new Server(httpServer, {
    cors: { origin: "*" },
  });

  io.on("connection", (socket) => {
    socket.on(
      "room:create",
      safeHandler<RoomCreatePayload, RoomJoinedAckData>((payload, ack) => {
        const nickname = validateNickname(payload?.nickname);
        const { room, playerId } = createRoom(nickname);
        joinSocketToRoom(socket, room.code, playerId);
        ack({ ok: true, code: room.code, playerId, view: lobbyView(room) });
      }),
    );

    socket.on(
      "room:join",
      safeHandler<RoomJoinPayload, RoomJoinedAckData>((payload, ack) => {
        const code = validateRoomCode(payload?.code);
        const nickname = validateNickname(payload?.nickname);
        const { room, playerId } = joinRoom(code, nickname);
        joinSocketToRoom(socket, room.code, playerId);
        ack({ ok: true, code: room.code, playerId, view: lobbyView(room) });
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

/**
 * In-memory room state: lobby -> draft -> playing -> finished.
 *
 * This module owns all room *logic* (creating/joining rooms, starting the
 * draft, submitting boards, calling numbers, leaving/disconnecting) so it
 * can be unit-tested without touching a socket. server.ts is only a thin
 * transport layer on top: it turns Socket.IO events into calls here and
 * turns the results back into acks/broadcasts.
 *
 * The pure game engine (../engine) never sees a Room - it only sees the
 * MatchState that gets built once every player has submitted a board.
 *
 * // ponytail: in-memory store, hilang saat restart - ganti Redis/persistence
 * kalau sudah perlu scale/reconnect.
 */

import { randomUUID } from "node:crypto";
import {
  type Board,
  type MatchPlayer,
  type MatchState,
  callNumber as engineCallNumber,
  createMatch,
  MIN_PLAYERS,
  validateBoard,
} from "../engine/index.ts";

export const ROOM_CODE_LENGTH = 6;
export const MAX_PLAYERS = 8;

/** Uppercase alphanumeric, no 0/O/1/I to avoid ambiguity when read aloud/typed. */
const ROOM_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export type RoomPhase = "lobby" | "draft" | "playing" | "finished";
/**
 * "casual" (default) has no skill loadout. "standard" enables loadout:set
 * (CLAUDE.md's Mode section - "Standard" has a loadout, "Ranked" not
 * implemented yet). Chosen at room:create; fixed for the room's lifetime.
 */
export type RoomMode = "casual" | "standard";

/**
 * Max skills a loadout may contain - mirrors chain/reader.ts's
 * MAX_LOADOUT_SIZE (CLAUDE.md: "Max 2 skill per loadout"). Kept as its own
 * constant rather than importing chain/reader.ts here so this module stays
 * entirely chain-agnostic (see server.ts's LoadoutVerifier for the DI
 * boundary that actually talks to chain).
 */
export const MAX_LOADOUT_SIZE = 2;

export interface RoomPlayer {
  readonly playerId: string;
  nickname: string;
  board?: Board;
  connected: boolean;
  /** Linked wallet address (lowercased) - set via wallet:link, see server.ts. */
  wallet?: string;
  /** On-chain-verified loadout (skill token ids) - set via loadout:set, "standard" mode only. */
  loadout?: readonly number[];
}

export interface Room {
  readonly code: string;
  hostId: string;
  readonly mode: RoomMode;
  players: RoomPlayer[];
  phase: RoomPhase;
  match?: MatchState;
}

const rooms = new Map<string, Room>();

function generateRoomCode(): string {
  let code: string;
  do {
    code = Array.from(
      { length: ROOM_CODE_LENGTH },
      () => ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)]!,
    ).join("");
  } while (rooms.has(code));
  return code;
}

function requireRoom(code: string): Room {
  const room = rooms.get(code);
  if (!room) throw new Error(`Room ${code} not found`);
  return room;
}

function requirePlayer(room: Room, playerId: string): RoomPlayer {
  const player = room.players.find((p) => p.playerId === playerId);
  if (!player) throw new Error(`Player ${playerId} is not in room ${room.code}`);
  return player;
}

/** Looks up a room by code without throwing. Used for read-only access (views, socket wiring). */
export function getRoom(code: string): Room | undefined {
  return rooms.get(code);
}

export interface CreateRoomOptions {
  /** Defaults to "casual". */
  readonly mode?: RoomMode;
  /** Wallet already linked on this socket (via wallet:link) before creating the room, if any. */
  readonly wallet?: string;
}

/** Creates a new lobby with `nickname` as the sole player and host. */
export function createRoom(nickname: string, opts: CreateRoomOptions = {}): { room: Room; playerId: string } {
  const playerId = randomUUID();
  const code = generateRoomCode();
  const room: Room = {
    code,
    hostId: playerId,
    mode: opts.mode ?? "casual",
    players: [{ playerId, nickname, connected: true, wallet: opts.wallet }],
    phase: "lobby",
  };
  rooms.set(code, room);
  return { room, playerId };
}

export interface JoinRoomOptions {
  /** Wallet already linked on this socket (via wallet:link) before joining the room, if any. */
  readonly wallet?: string;
}

/**
 * Joins an existing room. Only allowed while the room is still accepting
 * players (lobby or draft) and not yet full (MAX_PLAYERS).
 */
export function joinRoom(
  code: string,
  nickname: string,
  opts: JoinRoomOptions = {},
): { room: Room; playerId: string } {
  const room = requireRoom(code);

  if (room.phase !== "lobby" && room.phase !== "draft") {
    throw new Error(`Cannot join room ${code}: match already in progress`);
  }
  if (room.players.length >= MAX_PLAYERS) {
    throw new Error(`Room ${code} is full`);
  }

  const playerId = randomUUID();
  room.players.push({ playerId, nickname, connected: true, wallet: opts.wallet });
  return { room, playerId };
}

/**
 * Removes a player entirely from a room: transfers host if the host left,
 * deletes the room if it's now empty. Used both for an explicit leave
 * during lobby/draft and internally by exitRoom.
 */
export function leaveRoom(code: string, playerId: string): Room | undefined {
  const room = rooms.get(code);
  if (!room) return undefined;

  room.players = room.players.filter((p) => p.playerId !== playerId);

  if (room.players.length === 0) {
    rooms.delete(code);
    return undefined;
  }

  if (room.hostId === playerId) {
    room.hostId = room.players[0]!.playerId;
  }

  return room;
}

/** Host-only: moves the room from "lobby" into "draft". Requires >= MIN_PLAYERS. */
export function startDraft(code: string, playerId: string): Room {
  const room = requireRoom(code);

  if (room.hostId !== playerId) {
    throw new Error("Only the host can start the draft phase");
  }
  if (room.phase !== "lobby") {
    throw new Error(`Cannot start draft from phase "${room.phase}"`);
  }
  if (room.players.length < MIN_PLAYERS) {
    throw new Error(`Draft requires at least ${MIN_PLAYERS} players, got ${room.players.length}`);
  }

  room.phase = "draft";
  return room;
}

/**
 * Records a player's drafted board (validated via the engine's
 * validateBoard). Once every player in the room has submitted, builds the
 * MatchState via createMatch and flips the room to "playing".
 */
export function submitBoard(code: string, playerId: string, numbers: readonly number[]): Room {
  const room = requireRoom(code);

  if (room.phase !== "draft") {
    throw new Error(`Cannot submit a board outside draft phase (current phase: "${room.phase}")`);
  }

  const player = requirePlayer(room, playerId);

  const validation = validateBoard(numbers);
  if (!validation.valid) {
    throw new Error(`Invalid board: ${validation.error}`);
  }

  player.board = numbers;

  if (room.players.every((p) => p.board !== undefined)) {
    const matchPlayers: MatchPlayer[] = room.players.map((p) => ({ id: p.playerId, board: p.board! }));
    room.match = createMatch(matchPlayers);
    room.phase = "playing";
  }

  return room;
}

// -- wallet / loadout ---------------------------------------------------
//
// Wallet linking itself (nonce issuance, signature verification) lives in
// server.ts - it's a socket-level concern (nonce is per-socket, may happen
// before a player has even joined a room) rather than room state. This
// module only owns attaching the *result* (address, verified loadout) to a
// RoomPlayer, plus the invariants around when a loadout may be set.

/** Attaches a linked wallet address to a player already in this room. */
export function setPlayerWallet(room: Room, playerId: string, wallet: string): void {
  const player = requirePlayer(room, playerId);
  player.wallet = wallet;
}

/**
 * Throws unless `playerId` is currently allowed to set/change a loadout in
 * `room`: "standard" mode only, lobby/draft phase only (frozen once
 * "playing" starts - CLAUDE.md: "Loadout dibekukan saat match mulai"), and
 * only after wallet:link. Returns the player so callers (server.ts) don't
 * need a second lookup before calling the async on-chain verifier.
 */
export function assertCanSetLoadout(room: Room, playerId: string): RoomPlayer {
  if (room.mode !== "standard") {
    throw new Error(`loadout:set is only available in "standard" mode rooms (this room is "${room.mode}")`);
  }
  if (room.phase !== "lobby" && room.phase !== "draft") {
    throw new Error(`Cannot set loadout outside lobby/draft phase (current phase: "${room.phase}")`);
  }
  const player = requirePlayer(room, playerId);
  if (!player.wallet) {
    throw new Error("Wallet must be linked (wallet:link) before setting a loadout");
  }
  return player;
}

/**
 * Records a player's on-chain-verified loadout. Call only after
 * assertCanSetLoadout AND a successful chain verification - this function
 * itself does not re-check either, by design (see server.ts's loadout:set
 * handler, which is the only caller).
 */
export function setPlayerLoadout(room: Room, playerId: string, skillIds: readonly number[]): void {
  const player = requirePlayer(room, playerId);
  player.loadout = skillIds;
}

export interface CallNumberResult {
  readonly ok: boolean;
  readonly room?: Room;
  readonly error?: string;
}

/**
 * Thin wrapper around the engine's callNumber: delegates, and turns a
 * thrown Error into a { ok: false, error } result instead of propagating -
 * this is called on the hot path (every number call) so the socket layer
 * shouldn't need try/catch for it.
 */
export function callNumberInRoom(code: string, playerId: string, calledNumber: number): CallNumberResult {
  const room = rooms.get(code);
  if (!room) return { ok: false, error: `Room ${code} not found` };
  if (room.phase !== "playing" || !room.match) {
    return { ok: false, error: `Room ${code} does not have a match in progress` };
  }

  try {
    const next = engineCallNumber(room.match, playerId, calledNumber);
    room.match = next;
    if (next.status === "finished") {
      room.phase = "finished";
    }
    return { ok: true, room };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export interface ExitResult {
  readonly room: Room | undefined;
  /** True when this exit aborted an in-progress match (phase was "playing"). */
  readonly matchAborted: boolean;
}

/**
 * A player is gone, either because they deliberately left (room:leave) or
 * their socket disconnected - the rule is the same either way:
 *  - phase "playing": match is aborted (phase -> "finished", no winner);
 *    the player is kept in the room, just marked disconnected.
 *  - phase "finished": no-op besides marking disconnected.
 *  - phase "lobby"/"draft": player is fully removed (host transfer / empty
 *    room deletion via leaveRoom) - there's no match to protect yet.
 *
 * // ponytail: abort saat DC - upgrade ke reconnect grace period + skip
 * turn nanti kalau perlu.
 */
export function exitRoom(code: string, playerId: string): ExitResult {
  const room = rooms.get(code);
  if (!room) return { room: undefined, matchAborted: false };

  if (room.phase === "playing") {
    const player = room.players.find((p) => p.playerId === playerId);
    if (player) player.connected = false;
    room.phase = "finished";
    return { room, matchAborted: true };
  }

  if (room.phase === "finished") {
    const player = room.players.find((p) => p.playerId === playerId);
    if (player) player.connected = false;
    return { room, matchAborted: false };
  }

  return { room: leaveRoom(code, playerId), matchAborted: false };
}

/** Deletes a room outright, regardless of phase. */
export function removeRoom(code: string): void {
  rooms.delete(code);
}

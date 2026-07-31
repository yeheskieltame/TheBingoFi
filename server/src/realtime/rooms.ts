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
 * // ponytail: rooms/matches stay in-memory ON PURPOSE, even though
 * players/quest_progress/daily_scores/plaza_messages now persist to
 * Postgres when configured (see ../db/, ../identity/identity.ts,
 * ../api/questStore.ts, ../api/dailyLeaderboard.ts, ../plaza/plaza.ts). A
 * match is minutes long and is tied to live socket connections - there is
 * no "resume" story for a Socket.IO room after a process restart (every
 * client would need to reconnect and re-authenticate anyway), so
 * persisting Room/MatchState would be state nobody could ever actually
 * recover, just risk of drift. Consequence: a server restart mid-match
 * loses that match outright (same as before this task - see rooms.ts's
 * exitRoom for the equivalent "player disconnects mid-match" case, which
 * already aborts rather than trying to preserve anything). What DOES
 * survive a restart: each player's stable accountId, their quest progress,
 * daily leaderboard entries, and Plaza history - only the ephemeral
 * in-match state is lost.
 */

import { randomUUID } from "node:crypto";
import { arrangeBoard, type Rng } from "../bot/bot.ts";
import {
  type Board,
  type MatchPlayer,
  type MatchState,
  type SkillArgs,
  type SkillInstance,
  callNumber as engineCallNumber,
  createMatch,
  MIN_PLAYERS,
  respondToSkill as engineRespondToSkill,
  useSkill as engineUseSkill,
  validateBoard,
} from "../engine/index.ts";

export const ROOM_CODE_LENGTH = 6;
/** Room capacity ceiling AND default - mirrors engine/match.ts's MAX_PLAYERS (CONCEPT.md §2: "2–5 pemain per room"). Individual rooms may set a smaller `maxPlayers` (>= MIN_PLAYERS) via CreateRoomOptions, never larger. */
export const MAX_PLAYERS = 5;

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
 * "public" rooms are discoverable via room:list and eligible for room:quick
 * matching (CONCEPT.md §2b's "Room Browser"/"Quick Match"). "private"
 * (default) rooms are code-only - never listed, never auto-matched into.
 * Chosen at room:create; fixed for the room's lifetime.
 */
export type RoomVisibility = "public" | "private";

/**
 * Which bot (if any) occupies a seat in this room - set once, at
 * creation, by createBotRoom (CONCEPT.md §2b's "VS Bot"). `playerId`
 * matches one entry in `players` (see bot/bot.ts's isBotPlayerId - always
 * `bot:<uuid>`); `level` (1-10) drives bot/bot.ts's pickCall difficulty and
 * is echoed back into quest events (see ../realtime/server.ts) so the bot
 * ladder quests (QuestFilter.minBotLevel) can track it.
 */
export interface RoomBot {
  readonly level: number;
  readonly playerId: string;
}

/**
 * Max skills a loadout may contain - mirrors chain/reader.ts's
 * MAX_LOADOUT_SIZE (CLAUDE.md: "Max 2 skill per loadout"). Kept as its own
 * constant rather than importing chain/reader.ts here so this module stays
 * entirely chain-agnostic (see server.ts's LoadoutVerifier for the DI
 * boundary that actually talks to chain).
 */
export const MAX_LOADOUT_SIZE = 2;

export interface RoomPlayer {
  /** Ephemeral, per-room seat id - fresh randomUUID() every createRoom/joinRoom, used for turn order/board redaction. NEVER used as a persistence key (see accountId below) - see server/API.md's "Identity" section for why. */
  readonly playerId: string;
  nickname: string;
  board?: Board;
  connected: boolean;
  /**
   * Stable account id (../identity/identity.ts) - survives across rooms/
   * matches/reconnects, the key quest progress and (when supplied) the
   * daily leaderboard are recorded against (see api/questStore.ts,
   * api/dailyLeaderboard.ts). Always set for a human player (server.ts
   * resolves one via identity:hello or an automatic anonymous fallback
   * before ever calling createRoom/joinRoom) - absent only for the
   * synthetic VS Bot seat (see createBotRoom), which has no persistent
   * identity of its own.
   */
  readonly accountId?: string;
  /** Linked wallet address (lowercased) - set via wallet:link, see server.ts. */
  wallet?: string;
  /** On-chain-verified loadout (skill token ids) - set via loadout:set, "standard" mode only. */
  loadout?: readonly number[];
}

export interface Room {
  readonly code: string;
  hostId: string;
  readonly mode: RoomMode;
  /** Room capacity, 2-5 (CONCEPT.md §2's "Create Room: set target pemain 2–5") - default MAX_PLAYERS (5). Fixed for the room's lifetime. */
  readonly maxPlayers: number;
  /** Discoverability - see RoomVisibility. Default "private". */
  readonly visibility: RoomVisibility;
  /**
   * Quick-match rooms only (CONCEPT.md §2b): once `players.length` reaches
   * `maxPlayers`, the room advances straight into "draft" without a host
   * action - see joinRoom. Default false (manual rooms always need an
   * explicit draft:start).
   */
  readonly autoStart: boolean;
  /** Set only for a VS Bot room (room:createBot) - see RoomBot. */
  bot?: RoomBot;
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
  /** Room capacity, 2-5. Defaults to MAX_PLAYERS (5). */
  readonly maxPlayers?: number;
  /** Defaults to "private". */
  readonly visibility?: RoomVisibility;
  /** Defaults to false - see Room.autoStart. */
  readonly autoStart?: boolean;
}

function validateMaxPlayers(maxPlayers: number): void {
  if (!Number.isInteger(maxPlayers) || maxPlayers < MIN_PLAYERS || maxPlayers > MAX_PLAYERS) {
    throw new Error(`maxPlayers must be an integer between ${MIN_PLAYERS} and ${MAX_PLAYERS}, got ${maxPlayers}`);
  }
}

/** Creates a new lobby with `nickname` as the sole player and host. `accountId` is the caller's stable identity (../identity/identity.ts) - server.ts always resolves one (identity:hello or an automatic anonymous fallback) before calling this. */
export function createRoom(
  nickname: string,
  accountId: string,
  opts: CreateRoomOptions = {},
): { room: Room; playerId: string } {
  const maxPlayers = opts.maxPlayers ?? MAX_PLAYERS;
  validateMaxPlayers(maxPlayers);

  const playerId = randomUUID();
  const code = generateRoomCode();
  const room: Room = {
    code,
    hostId: playerId,
    mode: opts.mode ?? "casual",
    maxPlayers,
    visibility: opts.visibility ?? "private",
    autoStart: opts.autoStart ?? false,
    players: [{ playerId, accountId, nickname, connected: true, wallet: opts.wallet }],
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
 * players (lobby or draft) and not yet full (room.maxPlayers). If this join
 * fills an autoStart room (CONCEPT.md §2b's Quick Match) while it's still
 * in "lobby", the room advances straight into "draft" - no host action
 * needed, matching room:quick's "auto-mulai draft begitu penuh".
 * `accountId` - see createRoom's doc.
 */
export function joinRoom(
  code: string,
  nickname: string,
  accountId: string,
  opts: JoinRoomOptions = {},
): { room: Room; playerId: string } {
  const room = requireRoom(code);

  if (room.phase !== "lobby" && room.phase !== "draft") {
    throw new Error(`Cannot join room ${code}: match already in progress`);
  }
  if (room.players.length >= room.maxPlayers) {
    throw new Error(`Room ${code} is full`);
  }

  const playerId = randomUUID();
  room.players.push({ playerId, accountId, nickname, connected: true, wallet: opts.wallet });

  if (room.autoStart && room.phase === "lobby" && room.players.length >= room.maxPlayers) {
    room.phase = "draft";
  }

  return { room, playerId };
}

/**
 * Public, joinable rooms for room:list / the Room Browser (CONCEPT.md
 * §2b): "public" visibility, still in "lobby" (draft has already started
 * drafting boards - joining mid-draft would leave a player behind), and
 * with an open seat. Never returns a private room - see views.ts's
 * roomSummaryView for the redaction that keeps players[]/match state out
 * of what's sent back too.
 */
export function listJoinableRooms(): readonly Room[] {
  return [...rooms.values()].filter(
    (room) => room.visibility === "public" && room.phase === "lobby" && room.players.length < room.maxPlayers,
  );
}

export interface QuickMatchOptions {
  /** Wallet already linked on this socket (via wallet:link), if any. */
  readonly wallet?: string;
}

/**
 * Quick Match (CONCEPT.md §2b): joins an existing public, casual,
 * autoStart, still-open room of exactly `size` maxPlayers if one exists,
 * otherwise creates a fresh one (host = this caller) - same ack shape as
 * createRoom/joinRoom either way, so callers (server.ts) don't need to
 * branch on which happened. Casual-only by design (CONCEPT.md's "pilih
 * jumlah pemain (2–5) -> auto-join room publik yang cocok" describes VS
 * Player quick match, which never carries a skill loadout).
 */
export function quickMatch(
  nickname: string,
  size: number,
  accountId: string,
  opts: QuickMatchOptions = {},
): { room: Room; playerId: string } {
  validateMaxPlayers(size);

  const existing = [...rooms.values()].find(
    (room) =>
      room.mode === "casual" &&
      room.visibility === "public" &&
      room.autoStart &&
      room.phase === "lobby" &&
      room.maxPlayers === size &&
      room.players.length < room.maxPlayers,
  );

  if (existing) {
    return joinRoom(existing.code, nickname, accountId, { wallet: opts.wallet });
  }

  return createRoom(nickname, accountId, {
    mode: "casual",
    visibility: "public",
    autoStart: true,
    maxPlayers: size,
    wallet: opts.wallet,
  });
}

export interface CreateBotRoomOptions {
  /** Source of randomness for the bot's drafted board (bot/bot.ts's arrangeBoard) - defaults to Math.random. Overridable for deterministic tests. */
  readonly rng?: Rng;
}

/**
 * VS Bot (CONCEPT.md §2b): a private, casual, 2-seat room with `nickname`
 * as the human host plus one bot player (id `bot:<uuid>`, nickname
 * `Bot Lv<level>`) at the given difficulty (1-10, see bot/bot.ts's
 * MIN_BOT_LEVEL/MAX_BOT_LEVEL). Skips the lobby entirely - the room starts
 * straight in "draft" ("match mulai instan") and the bot immediately
 * "submits" a random board via submitBoard (bot/bot.ts's arrangeBoard),
 * same path a human's draft:submit takes. The match itself only actually
 * starts once the human ALSO submits a board (submitBoard's usual "every
 * player has one" gate) - see realtime/server.ts for what schedules the
 * bot's own turns once play begins.
 *
 * `accountId` - the human host's stable identity (see createRoom's doc) -
 * used for the bot-ladder quest events a win against this bot produces
 * (CONCEPT.md §2b). The bot's own RoomPlayer entry deliberately gets no
 * accountId - it has no persistent identity, and its own match_played/
 * match_won events are dropped rather than recorded (see
 * realtime/server.ts's accountIdFor).
 */
export async function createBotRoom(
  nickname: string,
  level: number,
  accountId: string,
  opts: CreateBotRoomOptions = {},
): Promise<{ room: Room; playerId: string }> {
  if (!Number.isInteger(level) || level < 1 || level > 10) {
    throw new Error(`Bot level must be an integer between 1 and 10, got ${level}`);
  }
  const rng = opts.rng ?? Math.random;

  const { room, playerId } = createRoom(nickname, accountId, { mode: "casual", visibility: "private", maxPlayers: 2 });

  const botPlayerId = `bot:${randomUUID()}`;
  room.players.push({ playerId: botPlayerId, nickname: `Bot Lv${level}`, connected: true });
  room.bot = { level, playerId: botPlayerId };
  room.phase = "draft";

  await submitBoard(room.code, botPlayerId, arrangeBoard(rng));

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

export interface SubmitBoardOptions {
  /**
   * Resolves a player's on-chain-verified loadout (skillIds, see
   * loadout:set) into fresh SkillInstance[] (effectType + starting
   * chargesLeft) for createMatch - CLAUDE.md step 1. Only called for
   * players who actually set a non-empty loadout; absent entirely (casual
   * rooms never set one) means every player starts with an empty loadout,
   * unchanged from before the skill system existed. When a player DID set a
   * loadout but no resolver is configured, that player simply starts with
   * no skills rather than failing the whole match start - mirrors how
   * `verifyLoadout` absent already gates "standard" mode off much earlier
   * (room:create/loadout:set), so this is a defensive fallback, not the
   * normal path.
   */
  readonly resolveLoadout?: (skillIds: readonly number[]) => Promise<SkillInstance[]>;
}

/**
 * Records a player's drafted board (validated via the engine's
 * validateBoard). Once every player in the room has submitted, resolves any
 * set loadouts (see SubmitBoardOptions) and builds the MatchState via
 * createMatch, then flips the room to "playing".
 */
export async function submitBoard(
  code: string,
  playerId: string,
  numbers: readonly number[],
  opts: SubmitBoardOptions = {},
): Promise<Room> {
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
    const loadouts: Record<string, readonly SkillInstance[]> = {};
    if (opts.resolveLoadout) {
      const resolveLoadout = opts.resolveLoadout;
      for (const p of room.players) {
        if (p.loadout && p.loadout.length > 0) {
          loadouts[p.playerId] = await resolveLoadout(p.loadout);
        }
      }
    }

    const matchPlayers: MatchPlayer[] = room.players.map((p) => ({ id: p.playerId, board: p.board! }));
    room.match = createMatch(matchPlayers, { loadouts });
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

/** Same shape as CallNumberResult - kept as its own alias so useSkillInRoom/respondToSkillInRoom's intent reads clearly at their call sites (server.ts's skill:use/skill:respond handlers). */
export type SkillActionResult = CallNumberResult;

/**
 * Thin wrapper around the engine's useSkill - same shape/purpose as
 * callNumberInRoom (delegates, turns a thrown Error into { ok: false,
 * error } instead of propagating).
 */
export function useSkillInRoom(
  code: string,
  playerId: string,
  effectType: string,
  args: SkillArgs,
): SkillActionResult {
  const room = rooms.get(code);
  if (!room) return { ok: false, error: `Room ${code} not found` };
  if (room.phase !== "playing" || !room.match) {
    return { ok: false, error: `Room ${code} does not have a match in progress` };
  }

  try {
    const next = engineUseSkill(room.match, playerId, effectType, args);
    room.match = next;
    if (next.status === "finished") {
      room.phase = "finished";
    }
    return { ok: true, room };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Thin wrapper around the engine's respondToSkill - same shape/purpose as
 * callNumberInRoom (delegates, turns a thrown Error into { ok: false,
 * error } instead of propagating).
 */
export function respondToSkillInRoom(code: string, playerId: string, nullify: boolean): SkillActionResult {
  const room = rooms.get(code);
  if (!room) return { ok: false, error: `Room ${code} not found` };
  if (room.phase !== "playing" || !room.match) {
    return { ok: false, error: `Room ${code} does not have a match in progress` };
  }

  try {
    const next = engineRespondToSkill(room.match, playerId, nullify);
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
 * their socket disconnected:
 *  - a VS Bot room (room.bot set) only ever has one human seat - the room
 *    is deleted OUTRIGHT regardless of phase, since a bot can never play
 *    alone (CLAUDE.md step 3: "bot jangan bikin room zombie"; `room:
 *    undefined` in the result reflects that it's gone). server.ts is
 *    responsible for clearing that room's scheduled bot-turn timer, since
 *    that timer lives in the realtime layer, not here.
 *  - otherwise, phase "playing": match is aborted (phase -> "finished", no
 *    winner); the player is kept in the room, just marked disconnected.
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

  if (room.bot) {
    const matchAborted = room.phase === "playing";
    rooms.delete(code);
    return { room: undefined, matchAborted };
  }

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

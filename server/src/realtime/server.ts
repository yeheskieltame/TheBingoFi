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
  IdentityHelloAckData,
  IdentityHelloPayload,
  LoadoutSetPayload,
  LobbyAckData,
  MatchCallAckData,
  MatchCallPayload,
  PlazaHistoryAckData,
  PlazaSendAckData,
  PlazaSendPayload,
  RoomCreateBotPayload,
  RoomCreatePayload,
  RoomJoinPayload,
  RoomJoinedAckData,
  RoomListAckData,
  RoomQuickPayload,
  ServerToClientEvents,
  SkillRespondPayload,
  SkillUsePayload,
  WalletLinkAckData,
  WalletLinkPayload,
  WalletNonceAckData,
} from "../api/protocol.ts";
import { recordEvent } from "../api/questStore.ts";
import { MAX_BOT_LEVEL, MIN_BOT_LEVEL, pickCall } from "../bot/bot.ts";
import { MIN_PLAYERS, type MatchState, type PendingSkill, type SkillArgs, type SkillInstance } from "../engine/index.ts";
import { createIdentityStore, type IdentityStore } from "../identity/identity.ts";
import { createPlazaStore } from "../plaza/plaza.ts";
import { eventsFromCall, type GameEvent } from "../quest/events.ts";
import {
  assertCanSetLoadout,
  callNumberInRoom,
  createBotRoom,
  createRoom,
  exitRoom,
  getRoom,
  joinRoom,
  listJoinableRooms,
  MAX_LOADOUT_SIZE,
  MAX_PLAYERS,
  quickMatch,
  respondToSkillInRoom,
  type Room,
  type RoomMode,
  setPlayerLoadout,
  setPlayerWallet,
  startDraft,
  submitBoard,
  useSkillInRoom,
} from "./rooms.ts";
import { lobbyView, matchViewFor, roomSummaryView } from "./views.ts";

const MAX_NICKNAME_LENGTH = 24;
const MAX_ROOM_CODE_LENGTH = 12;
/** ~5 minutes - long enough for a wallet popup, short enough to bound replay risk. */
const WALLET_NONCE_TTL_MS = 5 * 60 * 1000;
/** How long a Nullify window stays open before every still-`awaiting` opponent auto-passes - see armNullifyTimer. Override via opts.nullifyTimeoutMs (tests use a much smaller value). */
const DEFAULT_NULLIFY_TIMEOUT_MS = 15_000;
/** How long the server waits before playing a VS Bot's turn (CONCEPT.md §2b) - just enough to feel like a "thinking" opponent rather than instant. Override via opts.botDelayMs (tests use 0). */
const DEFAULT_BOT_DELAY_MS = 700;

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
  /**
   * Resolves a player's verified loadout (skillIds) into fresh
   * SkillInstance[] (effectType + starting chargesLeft) once a match is
   * about to start - see rooms.ts's submitBoard/SubmitBoardOptions. Absent
   * (or a player who never set a loadout) means that player simply starts
   * with no skills - see index.ts for the production default.
   */
  readonly resolveLoadout?: (skillIds: readonly number[]) => Promise<SkillInstance[]>;
  /**
   * How long a Nullify window (see skill:pending) stays open before every
   * still-`awaiting` opponent auto-passes - default DEFAULT_NULLIFY_TIMEOUT_MS
   * (15s). Override for tests that need to observe a timeout without
   * actually waiting 15 real seconds.
   */
  readonly nullifyTimeoutMs?: number;
  /**
   * How long the server waits after it becomes a VS Bot's turn before it
   * actually plays (CONCEPT.md §2b) - default DEFAULT_BOT_DELAY_MS (700ms).
   * Override to 0 for tests that need a bot match to run to completion
   * without waiting in real time.
   */
  readonly botDelayMs?: number;
  /**
   * Stable player identity store (see ../identity/identity.ts) backing
   * `identity:hello` and every place a persisted, cross-match identity is
   * needed (room:create/join/quick/createBot, wallet:link - see
   * server/API.md's "Identity" section). Defaults to
   * `createIdentityStore()` (in-memory, or Postgres if `DATABASE_URL` is
   * set - see ../db/pool.ts) when absent - unlike `verifyLoadout`, this is
   * never "disabled", just picks its backend automatically. Overridable for
   * tests that need a specific store instance shared across assertions.
   */
  readonly identity?: IdentityStore;
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
  /**
   * Stable account id (../identity/identity.ts) - set on the FIRST
   * identity:hello call, OR lazily by ensureAccountId the first time some
   * other handler needs one (room:create/join/quick/createBot,
   * wallet:link) for a socket that never called identity:hello explicitly
   * ("guest lama/edge case" - see server/API.md's "Identity" section).
   * Unlike roomCode/playerId, this is NOT cleared on room:leave/disconnect
   * from a room - it's tied to the socket's connection lifetime, not room
   * membership.
   */
  accountId?: string;
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

/** room:create's optional maxPlayers - undefined means "use rooms.ts's default (5)", anything else must be 2-5 (rooms.ts re-validates too, but a boundary check here gives a clearer error message than letting the shape through). */
function validateOptionalMaxPlayers(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < MIN_PLAYERS || value > MAX_PLAYERS) {
    throw new Error(`maxPlayers must be an integer between ${MIN_PLAYERS} and ${MAX_PLAYERS}`);
  }
  return value;
}

function validateIsPublicFlag(value: unknown): boolean {
  if (value === undefined) return false;
  if (typeof value !== "boolean") throw new Error("isPublic must be a boolean");
  return value;
}

/** room:quick's target size - required (unlike room:create's optional maxPlayers), 2-5. */
function validateRoomSize(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < MIN_PLAYERS || value > MAX_PLAYERS) {
    throw new Error(`size must be an integer between ${MIN_PLAYERS} and ${MAX_PLAYERS}`);
  }
  return value;
}

function validateBotLevel(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < MIN_BOT_LEVEL || value > MAX_BOT_LEVEL) {
    throw new Error(`level must be an integer between ${MIN_BOT_LEVEL} and ${MAX_BOT_LEVEL}`);
  }
  return value;
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

function validateEffectType(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error("effectType must be a non-empty string");
  }
  return value;
}

/** Shape-only: which of cellIndex/a/b are present and are numbers. Range/relevance-to-effectType checks (e.g. "cellIndex 0-24", "CELL_SWAP needs both a and b") are the engine's job - see engine/skills.ts's validateSkillArgs, re-run server-side regardless of what the client sends. */
function validateSkillArgsPayload(value: unknown): SkillArgs {
  if (value === undefined) return {};
  if (typeof value !== "object" || value === null) {
    throw new Error("args must be an object");
  }
  const raw = value as Record<string, unknown>;
  const args: { cellIndex?: number; a?: number; b?: number } = {};
  for (const key of ["cellIndex", "a", "b"] as const) {
    if (raw[key] === undefined) continue;
    if (typeof raw[key] !== "number") throw new Error(`args.${key} must be a number`);
    args[key] = raw[key];
  }
  return args;
}

function validateNullifyFlag(value: unknown): boolean {
  if (typeof value !== "boolean") throw new Error("nullify must be a boolean");
  return value;
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

/** Delivery channel for a stable accountId (../identity/identity.ts) - quest:completed is targeted here (see emitQuestEvent), NOT playerChannel, since the ephemeral per-room playerId resets every match. */
function accountChannel(accountId: string): string {
  return `account:${accountId}`;
}

/**
 * Resolves this socket's stable accountId, creating one via `identity`'s
 * anonymous-hello path the first time it's needed if the client never
 * called identity:hello explicitly - see SocketData.accountId's doc and
 * server/API.md's "Identity" section ("guest lama/edge case"). Joins the
 * socket to its account channel (see accountChannel) exactly once, the
 * first time an accountId is established for it.
 */
async function ensureAccountId(socket: RealtimeSocket, identity: IdentityStore): Promise<string> {
  if (socket.data.accountId) return socket.data.accountId;
  const { playerId } = await identity.hello();
  socket.data.accountId = playerId;
  socket.join(accountChannel(playerId));
  return playerId;
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
// turns a match transition into events and broadcasts newly-completed
// quests. IMPORTANT: quest progress is recorded against the STABLE
// accountId (../identity/identity.ts), never rooms.ts's ephemeral per-room
// playerId - see accountIdFor below and server/API.md's "Identity" section
// for why (the old behavior reset progress every match).

/** Today's date (UTC) as YYYY-MM-DD - the period key questStore.ts's recordEvent needs. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** The stable accountId for a room's ephemeral seat id, if that seat has one - absent for the synthetic VS Bot seat (see rooms.ts's createBotRoom), which never gets an accountId. */
function accountIdFor(room: Room, ephemeralPlayerId: string): string | undefined {
  return room.players.find((p) => p.playerId === ephemeralPlayerId)?.accountId;
}

/** Folds one GameEvent (already carrying an accountId in `playerId` - see accountIdFor) into the shared quest store and broadcasts quest:completed (to that account's socket(s) only) for anything it newly completes. */
async function emitQuestEvent(io: RealtimeServer, event: GameEvent, dateISO: string): Promise<void> {
  const result = await recordEvent(event, dateISO);
  for (const quest of result.completed) {
    io.to(accountChannel(event.playerId)).emit("quest:completed", { questId: quest.id, title: quest.title });
  }
}

/**
 * eventsFromCall (../quest/events.ts) derives events from raw MatchState -
 * it has no idea a bot was even involved. `match_won` events therefore get
 * augmented HERE, once, with the room's bot difficulty (CONCEPT.md §2b's
 * bot ladder quests, QuestFilter.minBotLevel) whenever `room.bot` is set
 * AND the winner is the human (a bot "winning" against itself is
 * meaningless - there's exactly one human per bot room, so this is really
 * just "don't tag the bot's own win, which never happens to be recorded as
 * a quest anyway since quest progress is per human playerId").
 */
function augmentEventsForBot(room: Room, events: readonly GameEvent[]): readonly GameEvent[] {
  if (!room.bot) return events;
  const bot = room.bot;
  return events.map((event) =>
    event.type === "match_won" && event.playerId !== bot.playerId
      ? { ...event, botLevel: bot.level }
      : event,
  );
}

async function processQuestEvents(io: RealtimeServer, room: Room, prevMatch: MatchState, nextMatch: MatchState): Promise<void> {
  const events = augmentEventsForBot(room, eventsFromCall(prevMatch, nextMatch));
  if (events.length === 0) return;

  const dateISO = today();
  for (const event of events) {
    // Bot's own events (match_played/match_won for the synthetic VS Bot
    // seat) have no accountId - there's nothing persistent to record
    // progress against, so they're dropped rather than recorded under the
    // bot's ephemeral seat id (see accountIdFor's doc).
    const accountId = accountIdFor(room, event.playerId);
    if (!accountId) continue;
    await emitQuestEvent(io, { ...event, playerId: accountId }, dateISO);
  }
}

// -- skills (in-match) ---------------------------------------------------
//
// useSkill/respondToSkill (via rooms.ts's useSkillInRoom/respondToSkillInRoom)
// live behind the skill:use/skill:respond socket handlers below. A
// nullifiable skill use opens a Nullify window (MatchState.pendingSkill,
// see engine/skills.ts) that every capable opponent can act on via
// skill:respond - this section also owns the server-side timeout that
// auto-passes for whoever hasn't answered once the window expires, so a
// silent/AFK opponent can never stall a match indefinitely.
//
// One timer per room code (never per-skill) is enough: a room can only ever
// have one skill pending at a time (useSkill/respondToSkill both reject
// while one already is), so a fresh arm always first clears whatever was
// there before.

const nullifyTimers = new Map<string, NodeJS.Timeout>();

function clearNullifyTimer(code: string): void {
  const timer = nullifyTimers.get(code);
  if (timer) {
    clearTimeout(timer);
    nullifyTimers.delete(code);
  }
}

function armNullifyTimer(io: RealtimeServer, code: string, timeoutMs: number): void {
  clearNullifyTimer(code);
  const timer = setTimeout(() => autoPassNullify(io, code), timeoutMs);
  timer.unref?.(); // never keep the process alive just for a pending Nullify window
  nullifyTimers.set(code, timer);
}

/** Broadcasts a resolved (non-Nullified) skill's aftermath: updated match:state, skill:resolved, the skill_used quest event, whatever eventsFromCall derives from the prev->next transition (line completions, a win), and match:ended if it just finished. Shared by all three ways a skill can resolve without being Nullified: no capable opponent / CELL_SWAP (immediate, in the skill:use handler), every awaiting opponent passed (skill:respond), and the Nullify window timing out (autoPassNullify). */
async function announceSkillResolved(
  io: RealtimeServer,
  room: Room,
  prevMatch: MatchState,
  nextMatch: MatchState,
  pending: Pick<PendingSkill, "playerId" | "effectType">,
): Promise<void> {
  io.to(roomChannel(room.code)).emit("skill:resolved", {
    playerId: pending.playerId,
    effectType: pending.effectType,
    nullified: false,
  });
  const dateISO = today();
  // pending.playerId is the ephemeral room seat id (public, fine for the
  // broadcast above) - map to accountId before recording quest progress,
  // same as processQuestEvents (see accountIdFor's doc).
  const accountId = accountIdFor(room, pending.playerId);
  if (accountId) {
    await emitQuestEvent(io, { type: "skill_used", playerId: accountId, effectType: pending.effectType }, dateISO);
  }
  await processQuestEvents(io, room, prevMatch, nextMatch);
  if (nextMatch.status === "finished") {
    io.to(roomChannel(room.code)).emit("match:ended", { winnerId: nextMatch.winnerId ?? null });
  }
}

/** Fires once a room's Nullify window (see armNullifyTimer) expires: every opponent still in `awaiting` auto-passes, in order - respondToSkill only needs each id to still be in the (shrinking) awaiting list, which holds regardless of order since every id here started out in it exactly once. */
async function autoPassNullify(io: RealtimeServer, code: string): Promise<void> {
  nullifyTimers.delete(code);
  const room = getRoom(code);
  const pending = room?.match?.pendingSkill;
  if (!room || !pending) return;

  const prevMatch = room.match!;
  let result: ReturnType<typeof respondToSkillInRoom> = { ok: true, room };
  for (const playerId of pending.awaiting) {
    if (!result.ok || !result.room) break;
    result = respondToSkillInRoom(code, playerId, false);
  }
  if (!result.ok || !result.room) return; // unreachable in practice: every id in `awaiting` was valid when the window opened

  const updatedRoom = result.room;
  broadcastMatchState(io, updatedRoom);
  await announceSkillResolved(io, updatedRoom, prevMatch, updatedRoom.match!, pending);
}

// -- bot (VS Bot turns, CONCEPT.md §2b) ----------------------------------
//
// A VS Bot room (room.bot set, see rooms.ts's createBotRoom) is casual-only
// (no skills), so the bot only ever needs to play match:call - never
// skill:use/skill:respond. Every place a human's call could hand the turn
// to the bot (draft:submit completing the match, match:call itself) calls
// maybeScheduleBotTurn, which is a no-op unless it's actually the bot's
// turn right now. One timer per room code is enough for the same reason
// nullifyTimers is: a room only ever has one bot, and scheduling always
// clears whatever timer was there before.

const botTimers = new Map<string, NodeJS.Timeout>();

/** Clears a room's scheduled bot turn, if any - called both when a fresh turn is (re-)scheduled and when a bot room goes away (see exitRoom's docs on why a bot room is deleted outright rather than lingering). */
function clearBotTimer(code: string): void {
  const timer = botTimers.get(code);
  if (timer) {
    clearTimeout(timer);
    botTimers.delete(code);
  }
}

/** True iff `room` currently needs a bot turn scheduled: it has a bot, a match in progress, and it's that bot's turn right now. */
function isBotsTurn(room: Room): boolean {
  if (!room.bot || room.phase !== "playing" || !room.match || room.match.status !== "in_progress") {
    return false;
  }
  return room.match.players[room.match.currentTurnIndex]?.id === room.bot.playerId;
}

function maybeScheduleBotTurn(io: RealtimeServer, room: Room, delayMs: number): void {
  if (!isBotsTurn(room)) return;
  clearBotTimer(room.code);
  const timer = setTimeout(() => playBotTurn(io, room.code, delayMs), delayMs);
  timer.unref?.(); // never keep the process alive just for a scheduled bot turn
  botTimers.set(room.code, timer);
}

/**
 * Plays the bot's turn: picks a call via bot/bot.ts's pickCall (level +
 * public state only - the bot's own board plus calledNumbers, never an
 * opponent's board, see bot/bot.ts's fairness doc) and runs it through
 * EXACTLY the same path a human's match:call takes (callNumberInRoom,
 * broadcastMatchState, quest events, match:ended) - the bot is just
 * another player from the engine's point of view. Re-checks isBotsTurn
 * after the lookup in case the room vanished or the turn moved on for some
 * other reason between scheduling and firing (e.g. the human left, which
 * deletes a bot room outright - see rooms.ts's exitRoom).
 */
async function playBotTurn(io: RealtimeServer, code: string, delayMs: number): Promise<void> {
  botTimers.delete(code);
  const room = getRoom(code);
  if (!room || !isBotsTurn(room)) return;

  const bot = room.bot!;
  const prevMatch = room.match!;
  const botPlayer = prevMatch.players[prevMatch.currentTurnIndex]!;
  const number = pickCall(botPlayer.board, prevMatch.calledNumbers, bot.level, Math.random);

  const result = callNumberInRoom(code, bot.playerId, number);
  if (!result.ok || !result.room) return; // unreachable in practice: pickCall only ever returns a legal, uncalled number

  const updatedRoom = result.room;
  broadcastMatchState(io, updatedRoom);
  await processQuestEvents(io, updatedRoom, prevMatch, updatedRoom.match!);

  if (updatedRoom.match?.status === "finished") {
    io.to(roomChannel(code)).emit("match:ended", { winnerId: updatedRoom.match.winnerId ?? null });
    return;
  }

  maybeScheduleBotTurn(io, updatedRoom, delayMs); // defensive - never actually the bot's turn again immediately in a 2-player match, but harmless if it ever were
}

// -- server ---------------------------------------------------------

export function createRealtimeServer(httpServer: NodeHttpServer, opts: RealtimeServerOptions = {}): RealtimeServer {
  const io: RealtimeServer = new Server(httpServer, {
    cors: { origin: "*" },
  });
  const verifyLoadout = opts.verifyLoadout;
  const resolveLoadout = opts.resolveLoadout;
  const nullifyTimeoutMs = opts.nullifyTimeoutMs ?? DEFAULT_NULLIFY_TIMEOUT_MS;
  const botDelayMs = opts.botDelayMs ?? DEFAULT_BOT_DELAY_MS;
  // Stable identity store - picks Postgres/in-memory automatically (see
  // ../identity/identity.ts and ../db/pool.ts) unless a test injects its
  // own. Unlike verifyLoadout, this is never "disabled" - every socket ends
  // up with an accountId, explicitly via identity:hello or automatically
  // via ensureAccountId (see server/API.md's "Identity" section).
  const identity = opts.identity ?? createIdentityStore();
  // One Plaza per server instance (not a module-level singleton) - see
  // plaza/plaza.ts's createPlazaStore doc for why: it keeps this server's
  // chat history/rate-limit state from bleeding into any other instance
  // (e.g. two servers spun up back-to-back in tests).
  const plaza = createPlazaStore();

  io.on("connection", (socket) => {
    socket.on(
      "identity:hello",
      safeHandler<IdentityHelloPayload, IdentityHelloAckData>(async (payload, ack) => {
        const token = typeof payload?.token === "string" ? payload.token : undefined;
        const { playerId, token: resolvedToken } = await identity.hello(token);
        socket.data.accountId = playerId;
        socket.join(accountChannel(playerId));
        ack({ ok: true, playerId, token: resolvedToken });
      }),
    );

    socket.on(
      "room:create",
      safeHandler<RoomCreatePayload, RoomJoinedAckData>(async (payload, ack) => {
        const nickname = validateNickname(payload?.nickname);
        const mode = validateRoomMode(payload?.mode);
        if (mode === "standard" && !verifyLoadout) {
          throw new Error('Chain belum dikonfigurasi - mode "standard" tidak tersedia');
        }
        const maxPlayers = validateOptionalMaxPlayers(payload?.maxPlayers);
        const visibility = validateIsPublicFlag(payload?.isPublic) ? "public" : "private";
        const accountId = await ensureAccountId(socket, identity);
        const { room, playerId } = createRoom(nickname, accountId, {
          mode,
          maxPlayers,
          visibility,
          wallet: socket.data.walletAddress,
        });
        joinSocketToRoom(socket, room.code, playerId);
        ack({ ok: true, code: room.code, playerId, view: lobbyView(room) });
      }),
    );

    socket.on(
      "room:join",
      safeHandler<RoomJoinPayload, RoomJoinedAckData>(async (payload, ack) => {
        const code = validateRoomCode(payload?.code);
        const nickname = validateNickname(payload?.nickname);
        const accountId = await ensureAccountId(socket, identity);
        const { room, playerId } = joinRoom(code, nickname, accountId, { wallet: socket.data.walletAddress });
        joinSocketToRoom(socket, room.code, playerId);
        ack({ ok: true, code: room.code, playerId, view: lobbyView(room) });
        broadcastLobby(io, room);
      }),
    );

    socket.on(
      "room:list",
      safeHandler<EmptyAckData, RoomListAckData>((_payload, ack) => {
        ack({ ok: true, rooms: listJoinableRooms().map(roomSummaryView) });
      }),
    );

    socket.on(
      "room:quick",
      safeHandler<RoomQuickPayload, RoomJoinedAckData>(async (payload, ack) => {
        const nickname = validateNickname(payload?.nickname);
        const size = validateRoomSize(payload?.size);
        const accountId = await ensureAccountId(socket, identity);
        const { room, playerId } = quickMatch(nickname, size, accountId, { wallet: socket.data.walletAddress });
        joinSocketToRoom(socket, room.code, playerId);
        ack({ ok: true, code: room.code, playerId, view: lobbyView(room) });
        // Only broadcast when this call actually JOINED an existing room
        // (mirrors room:join) - quickMatch's other branch just created a
        // brand new room with this caller as its only player, same as
        // room:create, which also doesn't broadcast (nobody else to tell).
        if (room.players.length > 1) broadcastLobby(io, room);
      }),
    );

    socket.on(
      "room:createBot",
      safeHandler<RoomCreateBotPayload, RoomJoinedAckData>(async (payload, ack) => {
        const nickname = validateNickname(payload?.nickname);
        const level = validateBotLevel(payload?.level);
        const accountId = await ensureAccountId(socket, identity);
        const { room, playerId } = await createBotRoom(nickname, level, accountId);
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

        // Persist the link to the stable account (../identity/identity.ts),
        // not just this socket - throws if `linkedAddress` is already
        // linked to a DIFFERENT account ("satu wallet = satu akun"), which
        // safeHandler turns into an ack error below. wallet:link may be
        // called before ever joining a room, so this may be the first thing
        // that establishes an accountId for this socket at all.
        const accountId = await ensureAccountId(socket, identity);
        await identity.linkWallet(accountId, linkedAddress);

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
        clearNullifyTimer(ctx.roomCode);
        if (getRoom(ctx.roomCode)?.bot) clearBotTimer(ctx.roomCode);
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
      safeHandler<DraftSubmitPayload, LobbyAckData>(async (payload, ack) => {
        const ctx = requireSocketRoom(socket);
        const numbers = validateNumbersArray(payload?.numbers);
        const room = await submitBoard(ctx.roomCode, ctx.playerId, numbers, { resolveLoadout });
        ack({ ok: true, view: lobbyView(room) });
        broadcastLobby(io, room);
        if (room.phase === "playing") {
          broadcastMatchState(io, room);
          maybeScheduleBotTurn(io, room, botDelayMs);
        }
      }),
    );

    socket.on(
      "match:call",
      safeHandler<MatchCallPayload, MatchCallAckData>(async (payload, ack) => {
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
          await processQuestEvents(io, updatedRoom, prevMatch, updatedRoom.match);
        }

        if (updatedRoom.match?.status === "finished") {
          io.to(roomChannel(ctx.roomCode)).emit("match:ended", { winnerId: updatedRoom.match.winnerId ?? null });
        } else {
          maybeScheduleBotTurn(io, updatedRoom, botDelayMs);
        }
      }),
    );

    socket.on(
      "skill:use",
      safeHandler<SkillUsePayload, MatchCallAckData>(async (payload, ack) => {
        const ctx = requireSocketRoom(socket);
        const effectType = validateEffectType(payload?.effectType);
        const args = validateSkillArgsPayload(payload?.args);

        const room = getRoom(ctx.roomCode);
        if (!room) throw new Error(`Room ${ctx.roomCode} not found`);
        const prevMatch = room.match;

        const result = useSkillInRoom(ctx.roomCode, ctx.playerId, effectType, args);
        if (!result.ok || !result.room) {
          ack({ ok: false, error: result.error ?? "Unknown error" });
          return;
        }

        const updatedRoom = result.room;
        const view = matchViewFor(updatedRoom, ctx.playerId);
        if (!view) {
          // Unreachable in practice - see match:call's identical guard above.
          ack({ ok: false, error: "Match state unavailable" });
          return;
        }
        ack({ ok: true, view });
        broadcastMatchState(io, updatedRoom);

        const nextMatch = updatedRoom.match!;
        if (nextMatch.pendingSkill) {
          // Newly opened Nullify window - broadcast once here; further
          // narrowing of `awaiting` as opponents respond is only observable
          // via match:state (already sent above), not a repeat of this event.
          io.to(roomChannel(ctx.roomCode)).emit("skill:pending", {
            playerId: ctx.playerId,
            effectType,
            awaiting: nextMatch.pendingSkill.awaiting,
          });
          armNullifyTimer(io, ctx.roomCode, nullifyTimeoutMs);
          return;
        }

        // Resolved immediately: no Nullify-capable opponent, or CELL_SWAP
        // (which never opens a window at all - see engine/skills.ts).
        if (prevMatch) {
          await announceSkillResolved(io, updatedRoom, prevMatch, nextMatch, { playerId: ctx.playerId, effectType });
        }
      }),
    );

    socket.on(
      "skill:respond",
      safeHandler<SkillRespondPayload, MatchCallAckData>(async (payload, ack) => {
        const ctx = requireSocketRoom(socket);
        const nullify = validateNullifyFlag(payload?.nullify);

        const room = getRoom(ctx.roomCode);
        if (!room) throw new Error(`Room ${ctx.roomCode} not found`);
        const prevMatch = room.match;
        const pending = prevMatch?.pendingSkill;

        const result = respondToSkillInRoom(ctx.roomCode, ctx.playerId, nullify);
        if (!result.ok || !result.room) {
          ack({ ok: false, error: result.error ?? "Unknown error" });
          return;
        }

        const updatedRoom = result.room;
        const view = matchViewFor(updatedRoom, ctx.playerId);
        if (!view) {
          // Unreachable in practice - see match:call's identical guard above.
          ack({ ok: false, error: "Match state unavailable" });
          return;
        }
        ack({ ok: true, view });
        broadcastMatchState(io, updatedRoom);

        const nextMatch = updatedRoom.match!;
        if (nextMatch.pendingSkill || !pending || !prevMatch) {
          // Still awaiting other opponents (or, defensively, nothing was
          // actually pending) - nothing resolved yet.
          return;
        }

        clearNullifyTimer(ctx.roomCode);

        if (nullify) {
          io.to(roomChannel(ctx.roomCode)).emit("skill:resolved", {
            playerId: pending.playerId,
            effectType: pending.effectType,
            nullified: true,
            nullifiedBy: ctx.playerId,
          });
          return;
        }

        await announceSkillResolved(io, updatedRoom, prevMatch, nextMatch, pending);
      }),
    );

    // -- plaza (global chat, see plaza/plaza.ts) -------------------------
    //
    // Deliberately NOT room-scoped: plaza:send broadcasts to every
    // connected socket via io.emit, never io.to(roomChannel(...)) - see
    // CONCEPT.md §7.4b. Validation, trimming, rate limiting, and reply
    // rules (optional `replyTo`, max depth 1) all live in plaza.ts's
    // addMessage; this handler only forwards the raw payload in and the
    // resulting message (post or reply, same shape either way) out. History
    // stays flat/chronological - grouping replies under their post is a
    // client-side concern.

    socket.on(
      "plaza:send",
      safeHandler<PlazaSendPayload, PlazaSendAckData>(async (payload, ack) => {
        // accountId is attached ONLY if this socket already has one (see
        // plaza.ts's doc) - Plaza never forces identity creation just to
        // chat (guest play stays guest play).
        const message = await plaza.addMessage(socket.id, payload, undefined, socket.data.accountId);
        ack({ ok: true, message });
        io.emit("plaza:message", message);
      }),
    );

    socket.on(
      "plaza:history",
      safeHandler<EmptyAckData, PlazaHistoryAckData>(async (_payload, ack) => {
        ack({ ok: true, messages: await plaza.getHistory() });
      }),
    );

    socket.on("disconnect", () => {
      const { roomCode, playerId } = socket.data;
      if (!roomCode || !playerId) return;
      clearNullifyTimer(roomCode);
      if (getRoom(roomCode)?.bot) clearBotTimer(roomCode);

      const result = exitRoom(roomCode, playerId);
      applyExitResult(io, roomCode, result, "player_disconnected");
    });
  });

  return io;
}

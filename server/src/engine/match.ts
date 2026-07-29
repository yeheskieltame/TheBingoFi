/**
 * Match state machine. Pure, no I/O, no classes - a MatchState is a plain
 * immutable value and every transition returns a brand new MatchState
 * rather than mutating in place.
 *
 * Error convention: createMatch / callNumber are actions (they represent a
 * request to change match state), so they throw Error with a clear message
 * on any invalid request. validateBoard (board.ts) is a pure query used
 * internally to check board shape, and returns a result object instead -
 * see board.ts for why.
 *
 * Skill system: the skill-shaped state (loadout, daubedCells,
 * ghostNumbers, pendingSkill, armed, skillUsedThisTurn) lives here because
 * it's part of MatchState/MatchPlayer's shape, but the skill *actions*
 * (useSkill, respondToSkill, and per-skill effect resolution) live in
 * skills.ts to keep this file focused on the baseline turn/call/win loop.
 * skills.ts imports the types below and calls checkForWinner (exported)
 * after any skill effect that can change marking (Wild Daub, Cell Swap).
 * Every new field is optional with an implied empty/false default so old
 * callers (createMatch(players), callNumber(state, id, n)) keep compiling
 * and behaving exactly as before.
 */

import { type Board, MAX_NUMBER, MIN_NUMBER, validateBoard } from "./board.ts";
import { countCompletedLinesForPlayer } from "./lines.ts";

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 8;
export const LINES_TO_WIN = 5;

export type MatchStatus = "in_progress" | "finished";

/** One charge-limited copy of a skill in a player's loadout. effectType is
 *  the same string identifier the on-chain SkillRegistry uses (e.g.
 *  "WILD_DAUB") - see skills.ts for the concrete set the engine knows. */
export interface SkillInstance {
  readonly effectType: string;
  readonly chargesLeft: number;
}

/** Arguments for a pending/resolving skill use. Which fields are relevant
 *  depends on effectType - see skills.ts's per-skill validation. */
export interface SkillArgs {
  /** WILD_DAUB: board index (0-24) to daub. */
  readonly cellIndex?: number;
  /** CELL_SWAP: first board index (0-24) to swap. */
  readonly a?: number;
  /** CELL_SWAP: second board index (0-24) to swap. */
  readonly b?: number;
}

/**
 * A skill use awaiting a Nullify window: `playerId` used `effectType` with
 * `args`, charge already consumed, and every opponent in `awaiting` (ids)
 * still needs to decide whether to Nullify it (see skills.ts's
 * respondToSkill). Once `awaiting` is empty the effect resolves.
 */
export interface PendingSkill {
  readonly playerId: string;
  readonly effectType: string;
  readonly args: SkillArgs;
  readonly awaiting: readonly string[];
}

/** An effect armed for the rest of the current player's turn, set once a
 *  Double Call or Ghost Call resolves - consumed by the next callNumber(s)
 *  from that same player (see callNumber below). */
export interface ArmedState {
  readonly playerId: string;
  /** Double Call: how many more calls this turn feed into calledNumbers
   *  without advancing the turn (starts at 2: the bonus call + the
   *  player's normal call). */
  readonly double?: { readonly callsLeft: number };
  /** Ghost Call: the player's next call this turn goes to their own
   *  ghostNumbers instead of the shared calledNumbers. */
  readonly ghost?: boolean;
}

/** A player entering a match: identity + their drafted board, plus
 *  optional skill state (all default to "none" - see createMatch). */
export interface MatchPlayer {
  readonly id: string;
  readonly board: Board;
  /** This player's skill loadout for the match (max 2 per CLAUDE.md,
   *  enforced upstream at matchmaking - not re-checked here). Defaults to
   *  [] (casual / no skills). */
  readonly loadout?: readonly SkillInstance[];
  /** Board indices (0-24) marked via Wild Daub, independent of the number
   *  printed there. Defaults to []. */
  readonly daubedCells?: readonly number[];
  /** Numbers marked via Ghost Call - counted for this player's lines only,
   *  not added to the match-wide calledNumbers. Defaults to []. */
  readonly ghostNumbers?: readonly number[];
}

export interface MatchState {
  readonly players: readonly MatchPlayer[];
  /** Numbers called so far, in call order. Shared/global - marking a
   *  number affects every player's board equally, there is no per-board
   *  mark list. (Ghost Call numbers are deliberately NOT added here - see
   *  MatchPlayer.ghostNumbers.) */
  readonly calledNumbers: readonly number[];
  /** Index into `players` of whoever calls next. */
  readonly currentTurnIndex: number;
  readonly status: MatchStatus;
  /** Set once status is "finished". */
  readonly winnerId?: string;
  /** Set while a skill use is waiting on opponents' Nullify decisions -
   *  see skills.ts. While set, callNumber and useSkill both reject. */
  readonly pendingSkill?: PendingSkill;
  /** Set while a Double Call or Ghost Call is armed for the current
   *  player's turn - see skills.ts and callNumber. */
  readonly armed?: ArmedState;
  /** Whether the current turn's player has already used a skill this turn
   *  (max 1 skill per turn). Reset to false whenever the turn changes. */
  readonly skillUsedThisTurn: boolean;
}

export interface CreateMatchOptions {
  /** Starting skill loadout per player id. Players not present in this map
   *  (or when the map itself is omitted) start with an empty loadout, i.e.
   *  casual/no-skills - unchanged behavior from before the skill system. */
  readonly loadouts?: Readonly<Record<string, readonly SkillInstance[]>>;
}

/**
 * Starts a match once draft phase is done: validates player count (2-8)
 * and that every player's board is a valid, fully-drafted 5x5 board.
 * Throws on any violation. `opts.loadouts` seeds each player's skill
 * loadout (see CreateMatchOptions); omitted entirely, every player starts
 * with no skills, identical to calling createMatch(players) before the
 * skill system existed.
 */
export function createMatch(players: readonly MatchPlayer[], opts: CreateMatchOptions = {}): MatchState {
  if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) {
    throw new Error(
      `A match requires between ${MIN_PLAYERS} and ${MAX_PLAYERS} players, got ${players.length}`,
    );
  }

  const seenIds = new Set<string>();
  for (const player of players) {
    if (seenIds.has(player.id)) {
      throw new Error(`Duplicate player id: ${player.id}`);
    }
    seenIds.add(player.id);

    const result = validateBoard(player.board);
    if (!result.valid) {
      throw new Error(`Invalid board for player ${player.id}: ${result.error}`);
    }
  }

  const matchPlayers: MatchPlayer[] = players.map((player) => ({
    id: player.id,
    board: player.board,
    loadout: opts.loadouts?.[player.id] ?? [],
    daubedCells: [],
    ghostNumbers: [],
  }));

  return {
    players: matchPlayers,
    calledNumbers: [],
    currentTurnIndex: 0,
    status: "in_progress",
    skillUsedThisTurn: false,
  };
}

/**
 * Ids of every player who has reached LINES_TO_WIN completed lines given
 * calledSet, ordered by turn order starting from `actingIndex` (the player
 * whose action - a call, or a skill effect - just changed marking). Per
 * game rule: if several players cross the threshold on the same action,
 * the one first in that order - the actor themselves, then whoever is next
 * to act - wins. The first element of the returned array is the winner.
 * Skill-aware: each player's own ghostNumbers/daubedCells count toward
 * their own lines only (see lines.ts's countCompletedLinesForPlayer).
 */
function winners(
  state: MatchState,
  calledSet: ReadonlySet<number>,
  actingIndex: number,
): readonly string[] {
  const total = state.players.length;
  const result: string[] = [];
  for (let offset = 0; offset < total; offset++) {
    const player = state.players[(actingIndex + offset) % total]!;
    const ghostSet = new Set(player.ghostNumbers ?? []);
    const daubedCells = player.daubedCells ?? [];
    if (countCompletedLinesForPlayer(player.board, calledSet, ghostSet, daubedCells) >= LINES_TO_WIN) {
      result.push(player.id);
    }
  }
  return result;
}

/**
 * Recomputes every player's completed-line count against `state.calledNumbers`
 * (each player's own ghostNumbers/daubedCells included) and finishes the
 * match if anyone has reached LINES_TO_WIN, tie-breaking by turn order
 * starting from `actingPlayerId` - the player whose action just changed
 * marking. Returns `state` unchanged (same reference) if nobody has won,
 * or if the match is already finished. Exported for skills.ts: Wild Daub
 * and Cell Swap can complete a line without a callNumber, so they call
 * this after mutating the acting player's daubedCells/board.
 */
export function checkForWinner(state: MatchState, actingPlayerId: string): MatchState {
  if (state.status === "finished") return state;

  const actingIndex = state.players.findIndex((player) => player.id === actingPlayerId);
  if (actingIndex === -1) {
    throw new Error(`Unknown player id: ${actingPlayerId}`);
  }

  const calledSet = new Set(state.calledNumbers);
  const matchWinners = winners(state, calledSet, actingIndex);
  if (matchWinners.length > 0) {
    return { ...state, status: "finished", winnerId: matchWinners[0] };
  }
  return state;
}

/**
 * Plays one turn: `playerId` calls `calledNumber`. Validates, in order,
 * that the match is still running, that no skill is pending a Nullify
 * decision, that it is `playerId`'s turn, and that `calledNumber` is a
 * fresh integer in [1, 25].
 *
 * If `playerId` has a Ghost Call armed (state.armed), the number is marked
 * only for `playerId` (added to their ghostNumbers, NOT to the shared
 * calledNumbers) and the turn advances immediately - Ghost Call changes
 * *where* the call is marked, not how many calls the player gets.
 * Otherwise the number is marked globally (calledNumbers) as before; if
 * `playerId` has a Double Call armed, the turn only advances once its
 * `callsLeft` reaches 0 (so the player calls twice before losing the
 * turn) - unless the match finishes first, which cancels the second call.
 *
 * Either way, checks every player for a win using turn-order tie-breaking
 * (see `winners`/`checkForWinner`). Returns a new MatchState; throws Error
 * on any invalid call, and never mutates `state`.
 */
export function callNumber(
  state: MatchState,
  playerId: string,
  calledNumber: number,
): MatchState {
  if (state.status === "finished") {
    throw new Error("Match has already finished, no more numbers can be called");
  }
  if (state.pendingSkill) {
    throw new Error("A skill is pending a Nullify decision, no numbers can be called until it resolves");
  }

  const callerIndex = state.players.findIndex((player) => player.id === playerId);
  if (callerIndex === -1) {
    throw new Error(`Unknown player id: ${playerId}`);
  }
  if (callerIndex !== state.currentTurnIndex) {
    const expectedId = state.players[state.currentTurnIndex]!.id;
    throw new Error(`It is not ${playerId}'s turn, expected ${expectedId}`);
  }

  if (!Number.isInteger(calledNumber) || calledNumber < MIN_NUMBER || calledNumber > MAX_NUMBER) {
    throw new Error(
      `Called number must be an integer between ${MIN_NUMBER} and ${MAX_NUMBER}, got ${calledNumber}`,
    );
  }
  if (state.calledNumbers.includes(calledNumber)) {
    throw new Error(`Number ${calledNumber} has already been called`);
  }

  const armed = state.armed?.playerId === playerId ? state.armed : undefined;
  const total = state.players.length;

  if (armed?.ghost) {
    const player = state.players[callerIndex]!;
    if ((player.ghostNumbers ?? []).includes(calledNumber)) {
      throw new Error(`Number ${calledNumber} is already one of ${playerId}'s ghost numbers`);
    }

    const players = state.players.map((p, i) =>
      i === callerIndex ? { ...p, ghostNumbers: [...(p.ghostNumbers ?? []), calledNumber] } : p,
    );
    const resolved = checkForWinner({ ...state, players }, playerId);

    if (resolved.status === "finished") {
      return { ...resolved, armed: undefined, skillUsedThisTurn: false };
    }
    return {
      ...resolved,
      currentTurnIndex: (callerIndex + 1) % total,
      armed: undefined,
      skillUsedThisTurn: false,
    };
  }

  const calledNumbers = [...state.calledNumbers, calledNumber];
  const resolved = checkForWinner({ ...state, calledNumbers }, playerId);

  if (resolved.status === "finished") {
    return { ...resolved, armed: undefined };
  }

  if (armed?.double) {
    const callsLeft = armed.double.callsLeft - 1;
    if (callsLeft > 0) {
      return { ...resolved, armed: { ...armed, double: { callsLeft } } };
    }
  }

  return {
    ...resolved,
    currentTurnIndex: (callerIndex + 1) % total,
    armed: undefined,
    skillUsedThisTurn: false,
  };
}

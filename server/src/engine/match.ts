/**
 * Match state machine. Pure, no I/O, no classes - a MatchState is a plain
 * immutable value and every transition (currently only callNumber) returns
 * a brand new MatchState rather than mutating in place.
 *
 * Error convention: createMatch / callNumber are actions (they represent a
 * request to change match state), so they throw Error with a clear message
 * on any invalid request. validateBoard (board.ts) is a pure query used
 * internally to check board shape, and returns a result object instead -
 * see board.ts for why.
 *
 * No skill system yet (by design - see CLAUDE.md / CONCEPT.md, that's a
 * later phase). MatchState intentionally only carries what baseline bingo
 * needs so skills can be layered on without reshaping this file.
 */

import { type Board, MAX_NUMBER, MIN_NUMBER, validateBoard } from "./board.ts";
import { countCompletedLines } from "./lines.ts";

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 8;
export const LINES_TO_WIN = 5;

export type MatchStatus = "in_progress" | "finished";

/** A player entering a match: identity + their drafted board. */
export interface MatchPlayer {
  readonly id: string;
  readonly board: Board;
}

export interface MatchState {
  readonly players: readonly MatchPlayer[];
  /** Numbers called so far, in call order. Shared/global - marking a
   *  number affects every player's board equally, there is no per-board
   *  mark list. */
  readonly calledNumbers: readonly number[];
  /** Index into `players` of whoever calls next. */
  readonly currentTurnIndex: number;
  readonly status: MatchStatus;
  /** Set once status is "finished". */
  readonly winnerId?: string;
}

/**
 * Starts a match once draft phase is done: validates player count (2-8)
 * and that every player's board is a valid, fully-drafted 5x5 board.
 * Throws on any violation.
 */
export function createMatch(players: readonly MatchPlayer[]): MatchState {
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

  return {
    players,
    calledNumbers: [],
    currentTurnIndex: 0,
    status: "in_progress",
  };
}

/**
 * Ids of every player who has reached LINES_TO_WIN completed lines given
 * calledSet, ordered by turn order starting from `callerIndex` (the player
 * who just made the call). Per game rule: if several players cross the
 * threshold on the same call, the one first in that order - the caller
 * themselves, then whoever is next to act - wins. The first element of
 * the returned array is the winner.
 */
function winners(
  state: MatchState,
  calledSet: ReadonlySet<number>,
  callerIndex: number,
): readonly string[] {
  const total = state.players.length;
  const result: string[] = [];
  for (let offset = 0; offset < total; offset++) {
    const player = state.players[(callerIndex + offset) % total]!;
    if (countCompletedLines(player.board, calledSet) >= LINES_TO_WIN) {
      result.push(player.id);
    }
  }
  return result;
}

/**
 * Plays one turn: `playerId` calls `calledNumber`. Validates, in order,
 * that the match is still running, that it is `playerId`'s turn, and that
 * `calledNumber` is a fresh integer in [1, 25]. Marks the number (globally,
 * for every board), then checks every player for a win using turn-order
 * tie-breaking (see `winners`). Returns a new MatchState; throws Error on
 * any invalid call, and never mutates `state`.
 */
export function callNumber(
  state: MatchState,
  playerId: string,
  calledNumber: number,
): MatchState {
  if (state.status === "finished") {
    throw new Error("Match has already finished, no more numbers can be called");
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

  const calledNumbers = [...state.calledNumbers, calledNumber];
  const calledSet = new Set(calledNumbers);

  const matchWinners = winners(state, calledSet, callerIndex);
  if (matchWinners.length > 0) {
    return {
      ...state,
      calledNumbers,
      status: "finished",
      winnerId: matchWinners[0],
    };
  }

  return {
    ...state,
    calledNumbers,
    currentTurnIndex: (callerIndex + 1) % state.players.length,
  };
}

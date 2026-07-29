/**
 * Daily Challenge engine (CONCEPT.md §7.1): one solo puzzle a day, identical
 * for every player worldwide - a deterministic call order seeded from the
 * date, scored by how quickly a drafted board completes 5 lines ("BINGO").
 *
 * Pure functions only, no I/O - mirrors the rest of server/src/engine, and
 * reuses its board/line primitives instead of re-implementing them here.
 */

import { type Board, MAX_NUMBER, MIN_NUMBER, validateBoard } from "../engine/board.ts";
import { countCompletedLines } from "../engine/lines.ts";
import { LINES_TO_WIN } from "../engine/match.ts";

/**
 * First day TheBingoFi's daily challenge exists. challengeNumber(LAUNCH_DATE)
 * === 1; every subsequent calendar day increments by 1.
 */
export const LAUNCH_DATE = "2026-08-01";

// --- deterministic PRNG --------------------------------------------------
//
// Two small, well-known, dependency-free algorithms chained together:
// cyrb53-style hashing turns an arbitrary seed string into a 32-bit
// integer, then mulberry32 turns that integer into a repeatable stream of
// pseudo-random floats in [0, 1). Not cryptographic - the only property the
// daily challenge needs is "same seed string => same stream, everywhere".

function hashSeed(seed: string): number {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < seed.length; i++) {
    const ch = seed.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  return h1 >>> 0;
}

function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A fresh deterministic RNG for `seed` - same seed always yields the same stream of floats. */
function createRng(seed: string): () => number {
  return mulberry32(hashSeed(seed));
}

// --- call sequence ---------------------------------------------------------

/**
 * Deterministic permutation of 1-25: the order numbers are "called" in a
 * given day's challenge. Same `dateISO` + `salt` always produces the same
 * sequence (every player must face the identical puzzle); a different date
 * or salt produces a different one.
 *
 * `salt` lets callers derive independent-but-still-deterministic sequences
 * from the same date if ever needed (e.g. a regional variant) without
 * disturbing the plain date-seeded default used for the real daily puzzle.
 */
export function callSequence(dateISO: string, salt = ""): number[] {
  const rng = createRng(`${dateISO}:${salt}`);
  const sequence = Array.from(
    { length: MAX_NUMBER - MIN_NUMBER + 1 },
    (_, i) => MIN_NUMBER + i,
  );

  // Fisher-Yates.
  for (let i = sequence.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [sequence[i], sequence[j]] = [sequence[j]!, sequence[i]!];
  }

  return sequence;
}

// --- challenge numbering -----------------------------------------------

const MS_PER_DAY = 86_400_000;

/**
 * Day count since LAUNCH_DATE (UTC), 1-based - LAUNCH_DATE itself is #1,
 * each following calendar day is +1. `dateISO` is expected as a plain
 * "YYYY-MM-DD" date (no time component). Dates before launch legitimately
 * return <= 0; callers don't need to special-case that (see task spec).
 */
export function challengeNumber(dateISO: string): number {
  const launch = Date.parse(`${LAUNCH_DATE}T00:00:00Z`);
  const date = Date.parse(`${dateISO}T00:00:00Z`);
  return Math.round((date - launch) / MS_PER_DAY) + 1;
}

// --- solo simulation -----------------------------------------------------

export interface ChallengeResult {
  readonly number: number;
  /**
   * 1-based index of the call that completed the 5th line. Always <= 25:
   * callSequence is a full 1-25 permutation and a valid board contains
   * every number 1-25, so all 12 lines are complete (>= LINES_TO_WIN) by
   * call 25 at the latest.
   */
  readonly callsToBingo: number;
  /**
   * Completed-line count after each call, one entry per call up to and
   * including callsToBingo (so `linesPerCall.length === callsToBingo`).
   * Monotonically non-decreasing.
   */
  readonly linesPerCall: readonly number[];
  readonly score: number;
  /**
   * Which of the 25 board cells (row-major, same indexing as Board) were
   * marked by the time BINGO was reached - lets share.ts render the result
   * grid without ever exposing the board's actual numbers.
   */
  readonly markedAtBingo: readonly boolean[];
}

/**
 * Score formula - placeholder pending CONCEPT.md open question #5 ("skor
 * pakai jumlah call minimum atau timer, atau kombinasi?"). For now: fewer
 * calls to BINGO scores higher, linear in callsToBingo (best case, 1 call,
 * scores 2500; worst case, 25 calls, scores 100). Revisit once there's real
 * playtest data to decide whether a timing component should factor in too.
 */
function scoreFor(callsToBingo: number): number {
  return (26 - callsToBingo) * 100;
}

/**
 * Simulates a solo run of the day's challenge against `board`: marks
 * `callSequence(dateISO, salt)` one number at a time and stops the instant
 * 5 lines are complete. Throws if `board` isn't a valid drafted board (see
 * validateBoard in ../engine/board.ts).
 */
export function playChallenge(board: Board, dateISO: string, salt = ""): ChallengeResult {
  const validation = validateBoard(board);
  if (!validation.valid) {
    throw new Error(`Invalid board for daily challenge: ${validation.error}`);
  }

  const sequence = callSequence(dateISO, salt);
  const calledSet = new Set<number>();
  const linesPerCall: number[] = [];
  let callsToBingo = 0;

  for (const called of sequence) {
    calledSet.add(called);
    const lines = countCompletedLines(board, calledSet);
    linesPerCall.push(lines);
    if (lines >= LINES_TO_WIN) {
      callsToBingo = linesPerCall.length;
      break;
    }
  }

  return {
    number: challengeNumber(dateISO),
    callsToBingo,
    linesPerCall,
    score: scoreFor(callsToBingo),
    markedAtBingo: board.map((n) => calledSet.has(n)),
  };
}

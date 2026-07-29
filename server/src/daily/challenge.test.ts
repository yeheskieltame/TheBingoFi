import { test } from "node:test";
import assert from "node:assert/strict";
import { BOARD_SIZE, MAX_NUMBER } from "../engine/board.ts";
import { countCompletedLines } from "../engine/lines.ts";
import { LINES_TO_WIN } from "../engine/match.ts";
import { LAUNCH_DATE, callSequence, challengeNumber, playChallenge } from "./challenge.ts";

/** 1..25 in row-major order, as a plain mutable array (some tests mutate a copy). */
function identityBoard(): number[] {
  return Array.from({ length: BOARD_SIZE }, (_, i) => i + 1);
}

// --- callSequence ----------------------------------------------------------

test("callSequence returns all 25 numbers exactly once", () => {
  const sequence = callSequence("2026-08-01");
  assert.equal(sequence.length, BOARD_SIZE);
  assert.deepEqual(
    [...sequence].sort((a, b) => a - b),
    Array.from({ length: MAX_NUMBER }, (_, i) => i + 1),
  );
});

test("callSequence is deterministic for the same date and salt", () => {
  const a = callSequence("2026-08-01", "abc");
  const b = callSequence("2026-08-01", "abc");
  assert.deepEqual(a, b);
});

test("callSequence differs between two different dates", () => {
  const a = callSequence("2026-08-01");
  const b = callSequence("2026-08-02");
  assert.notDeepEqual(a, b);
});

test("callSequence differs between two different salts on the same date", () => {
  const a = callSequence("2026-08-01", "one");
  const b = callSequence("2026-08-01", "two");
  assert.notDeepEqual(a, b);
});

// --- challengeNumber ---------------------------------------------------

test("challengeNumber: LAUNCH_DATE is challenge #1", () => {
  assert.equal(challengeNumber(LAUNCH_DATE), 1);
});

test("challengeNumber increases by 1 per calendar day after launch", () => {
  assert.equal(challengeNumber("2026-08-02"), 2);
  assert.equal(challengeNumber("2026-08-03"), 3);
  assert.equal(challengeNumber("2026-09-01"), 32); // 31 days after 2026-08-01
});

test("challengeNumber before LAUNCH_DATE is <= 0, unhandled specially", () => {
  assert.ok(challengeNumber("2026-07-31") <= 0);
  assert.equal(challengeNumber("2026-07-31"), 0);
});

// --- playChallenge -------------------------------------------------------

test("playChallenge matches an independently computed callsToBingo and linesPerCall", () => {
  const board = identityBoard();
  const dateISO = "2026-08-01";
  const sequence = callSequence(dateISO);

  // Independent brute-force check: re-derive the same call sequence and
  // walk it by hand (mark one number at a time, recount lines), without
  // going through playChallenge at all. Reuses countCompletedLines - per
  // CLAUDE.md this repo must not duplicate line-completion logic - but the
  // looping/stopping logic here is written fresh, not copied from
  // challenge.ts.
  const calledSet = new Set<number>();
  const expectedLinesPerCall: number[] = [];
  let expectedCallsToBingo = 0;
  for (const called of sequence) {
    calledSet.add(called);
    const lines = countCompletedLines(board, calledSet);
    expectedLinesPerCall.push(lines);
    if (lines >= LINES_TO_WIN) {
      expectedCallsToBingo = expectedLinesPerCall.length;
      break;
    }
  }

  const result = playChallenge(board, dateISO);
  assert.equal(result.callsToBingo, expectedCallsToBingo);
  assert.deepEqual(result.linesPerCall, expectedLinesPerCall);
  assert.equal(result.linesPerCall.length, result.callsToBingo);
  assert.ok(result.callsToBingo <= BOARD_SIZE);
  assert.equal(result.score, (26 - expectedCallsToBingo) * 100);
});

test("playChallenge linesPerCall is monotonically non-decreasing", () => {
  const result = playChallenge(identityBoard(), "2026-08-05", "monotonic");
  for (let i = 1; i < result.linesPerCall.length; i++) {
    assert.ok(result.linesPerCall[i]! >= result.linesPerCall[i - 1]!);
  }
});

test("playChallenge markedAtBingo reflects exactly the numbers called up to callsToBingo", () => {
  const board = identityBoard();
  const dateISO = "2026-08-01";
  const result = playChallenge(board, dateISO);
  const calledUpToBingo = new Set(callSequence(dateISO).slice(0, result.callsToBingo));
  const expectedMarked = board.map((n) => calledUpToBingo.has(n));
  assert.deepEqual(result.markedAtBingo, expectedMarked);
});

test("playChallenge throws on an invalid board", () => {
  const badBoard = identityBoard();
  badBoard[1] = badBoard[0]!; // duplicate -> invalid
  assert.throws(() => playChallenge(badBoard, "2026-08-01"), /invalid board/i);
});

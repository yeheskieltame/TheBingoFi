import { test } from "node:test";
import assert from "node:assert/strict";
import { type Board, BOARD_SIZE, validateBoard } from "../engine/board.ts";
import { arrangeBoard, epsilonForLevel, isBotPlayerId, pickCall, type Rng } from "./bot.ts";

/** 1..25 in row-major order - board[i] === i + 1, so a number's cell index is number - 1. */
function identityBoard(): Board {
  return Array.from({ length: BOARD_SIZE }, (_, i) => i + 1);
}

/** A constant-returning Rng - useful when the test only cares about the deterministic (exploit) branch. */
function constantRng(value: number): Rng {
  return () => value;
}

/** Returns `values` in order, one per call; repeats the last value once exhausted (so tests don't need to size the sequence exactly). */
function sequenceRng(values: readonly number[]): Rng {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)]!;
}

// -- arrangeBoard ---------------------------------------------------------

test("arrangeBoard produces a valid, fully-drafted board (permutation of 1-25)", () => {
  const board = arrangeBoard(Math.random);
  assert.equal(board.length, BOARD_SIZE);
  const result = validateBoard(board);
  assert.equal(result.valid, true, result.error);
});

test("arrangeBoard is deterministic for a fixed rng stream", () => {
  const values = [0.1, 0.2, 0.3, 0.4, 0.99, 0.01, 0.5, 0.6, 0.7, 0.8, 0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 0.95, 0.05, 0.12, 0.22, 0.32, 0.42];
  const a = arrangeBoard(sequenceRng(values));
  const b = arrangeBoard(sequenceRng(values));
  assert.deepEqual(a, b);
});

// -- epsilonForLevel --------------------------------------------------------

test("epsilonForLevel: Lv1 is 90% random, Lv10 is always greedy (0)", () => {
  assert.equal(epsilonForLevel(1), 0.9);
  assert.equal(epsilonForLevel(10), 0);
  assert.equal(epsilonForLevel(5), 0.5);
});

// -- pickCall: Lv10 (deterministic, always greedy) ---------------------------

test("pickCall at Lv10 deterministically completes a line when one call away, regardless of rng", () => {
  // identityBoard's row0 (LINES index 0) is {1,2,3,4,5}; calling "5" after
  // 1-4 completes it outright (+1000), dwarfing every other candidate.
  const board = identityBoard();
  const calledNumbers = [1, 2, 3, 4];

  for (const rngValue of [0, 0.5, 0.999]) {
    const call = pickCall(board, calledNumbers, 10, constantRng(rngValue));
    assert.equal(call, 5, `rng()=${rngValue} should not change the deterministic Lv10 pick`);
  }
});

test("pickCall at Lv10 prefers a line at 4/5 progress over one at 1/5, even with no immediate completion available", () => {
  // identityBoard, only row0's first three cells called: candidate 4 (row0,
  // idx3) sits on a line already 3/5 marked (score 3^2=9); candidate 6
  // (row1, idx5) sits on lines with only "1" marked (col0, score 1^2=1).
  // Neither call completes a line outright, so this isolates the quadratic
  // progress term from the +1000 completion bonus.
  const board = identityBoard();
  const calledNumbers = [1, 2, 3];

  const call = pickCall(board, calledNumbers, 10, constantRng(0.5));
  assert.equal(call, 4, "the almost-done line (3/5 marked) should be preferred over a barely-started one");
});

test("pickCall at Lv10 never returns an already-called number", () => {
  const board = identityBoard();
  let calledNumbers: number[] = [];
  const rng: Rng = Math.random;

  for (let i = 0; i < 20; i++) {
    const call = pickCall(board, calledNumbers, 10, rng);
    assert.ok(!calledNumbers.includes(call), `call ${call} was already called: ${JSON.stringify(calledNumbers)}`);
    calledNumbers = [...calledNumbers, call];
  }
});

// -- pickCall: Lv1 (mostly random) -------------------------------------------

test("pickCall at Lv1 with rng forced into the explore branch ignores the greedy pick", () => {
  // Same setup as the Lv10 completion test above - the greedy answer is
  // deterministically "5" (completes row0). At Lv1, epsilon is 0.9, so a
  // low first rng() draw (0.05 < 0.9) forces explore; the second draw picks
  // an index into the candidate list [5,6,7,...,25] (21 entries). 0.5 * 21
  // = 10.5 -> floor 10 -> candidates[10] = 15, which is NOT the greedy pick.
  const board = identityBoard();
  const calledNumbers = [1, 2, 3, 4];

  const call = pickCall(board, calledNumbers, 1, sequenceRng([0.05, 0.5]));
  assert.equal(call, 15);
  assert.notEqual(call, 5, "forced exploration should be able to override the greedy completion pick");
});

test("pickCall epsilon boundary: Lv1 explores when rng() draws just under 0.9, exploits when just at/above it", () => {
  const board = identityBoard();
  const calledNumbers = [1, 2, 3, 4];

  const explored = pickCall(board, calledNumbers, 1, sequenceRng([0.89, 0]));
  assert.equal(explored, 5, "0.89 < epsilon(1)=0.9, explore branch, second draw 0 picks the first candidate (5)");

  const exploited = pickCall(board, calledNumbers, 1, sequenceRng([0.9]));
  assert.equal(exploited, 5, "0.9 is not < epsilon(1)=0.9, exploit branch - happens to also be 5 here (the greedy pick)");
});

test("pickCall never returns an already-called number across all 10 levels", () => {
  const board = identityBoard();

  for (let level = 1; level <= 10; level++) {
    let calledNumbers: number[] = [];
    for (let i = 0; i < 24; i++) {
      const call = pickCall(board, calledNumbers, level, Math.random);
      assert.ok(
        !calledNumbers.includes(call),
        `Lv${level}: call ${call} was already called: ${JSON.stringify(calledNumbers)}`,
      );
      assert.ok(call >= 1 && call <= 25, `Lv${level}: call ${call} out of range`);
      calledNumbers = [...calledNumbers, call];
    }
  }
});

test("pickCall throws once every number has already been called", () => {
  const board = identityBoard();
  const calledNumbers = Array.from({ length: 25 }, (_, i) => i + 1);
  assert.throws(() => pickCall(board, calledNumbers, 10, Math.random), /no uncalled numbers/i);
});

// -- isBotPlayerId ------------------------------------------------------

test("isBotPlayerId recognizes the bot: prefix and rejects everything else", () => {
  assert.equal(isBotPlayerId("bot:abc-123"), true);
  assert.equal(isBotPlayerId("abc-123"), false);
  assert.equal(isBotPlayerId(""), false);
});

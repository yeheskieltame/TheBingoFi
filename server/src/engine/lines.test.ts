import { test } from "node:test";
import assert from "node:assert/strict";
import { type Board, BOARD_SIZE } from "./board.ts";
import { countCompletedLines } from "./lines.ts";

/**
 * Identity board: index i holds value i+1, so row/col/diagonal membership
 * is easy to reason about in values instead of indices.
 *   row0 = {1,2,3,4,5}       col0 = {1,6,11,16,21}
 *   row1 = {6,7,8,9,10}      col1 = {2,7,12,17,22}
 *   ...                       main diagonal = {1,7,13,19,25}
 *                             anti diagonal = {5,9,13,17,21}
 */
function identityBoard(): Board {
  return Array.from({ length: BOARD_SIZE }, (_, i) => i + 1);
}

test("countCompletedLines returns 0 when nothing is called", () => {
  const count = countCompletedLines(identityBoard(), new Set());
  assert.equal(count, 0);
});

test("countCompletedLines counts a completed row", () => {
  const calledSet = new Set([1, 2, 3, 4, 5]);
  const count = countCompletedLines(identityBoard(), calledSet);
  assert.equal(count, 1);
});

test("countCompletedLines counts a completed column", () => {
  const calledSet = new Set([1, 6, 11, 16, 21]);
  const count = countCompletedLines(identityBoard(), calledSet);
  assert.equal(count, 1);
});

test("countCompletedLines counts a completed diagonal", () => {
  const calledSet = new Set([1, 7, 13, 19, 25]);
  const count = countCompletedLines(identityBoard(), calledSet);
  assert.equal(count, 1);
});

test("countCompletedLines counts multiple simultaneously completed lines", () => {
  // row0 {1,2,3,4,5} + col0 {1,6,11,16,21} + main diagonal {1,7,13,19,25}
  const calledSet = new Set([1, 2, 3, 4, 5, 6, 11, 16, 21, 7, 13, 19, 25]);
  const count = countCompletedLines(identityBoard(), calledSet);
  assert.equal(count, 3);
});

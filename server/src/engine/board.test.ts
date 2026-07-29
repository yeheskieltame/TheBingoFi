import { test } from "node:test";
import assert from "node:assert/strict";
import { BOARD_SIZE, validateBoard } from "./board.ts";

/** 1..25 in order - a valid board, and predictable for other tests. */
function validNumbers(): number[] {
  return Array.from({ length: BOARD_SIZE }, (_, i) => i + 1);
}

test("validateBoard accepts a full 1-25 permutation", () => {
  const result = validateBoard(validNumbers());
  assert.equal(result.valid, true);
  assert.equal(result.error, undefined);
});

test("validateBoard rejects a board with a duplicate number", () => {
  const numbers = validNumbers();
  numbers[1] = numbers[0]!; // duplicate the first value
  const result = validateBoard(numbers);
  assert.equal(result.valid, false);
  assert.match(result.error ?? "", /duplicate/i);
});

test("validateBoard rejects numbers outside 1-25", () => {
  const numbers = validNumbers();
  numbers[0] = 26;
  const result = validateBoard(numbers);
  assert.equal(result.valid, false);
  assert.match(result.error ?? "", /between/i);
});

test("validateBoard rejects a board with fewer than 25 numbers", () => {
  const numbers = validNumbers().slice(0, 24);
  const result = validateBoard(numbers);
  assert.equal(result.valid, false);
  assert.match(result.error ?? "", /exactly 25/i);
});

test("validateBoard rejects a board with more than 25 numbers", () => {
  const numbers = [...validNumbers(), 1];
  const result = validateBoard(numbers);
  assert.equal(result.valid, false);
  assert.match(result.error ?? "", /exactly 25/i);
});

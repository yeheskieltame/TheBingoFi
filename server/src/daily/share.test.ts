import { test } from "node:test";
import assert from "node:assert/strict";
import { BOARD_SIZE } from "../engine/board.ts";
import { playChallenge } from "./challenge.ts";
import { shareCard } from "./share.ts";

/** 1..25 in row-major order. */
function identityBoard(): number[] {
  return Array.from({ length: BOARD_SIZE }, (_, i) => i + 1);
}

test("shareCard (id) headline has the challenge number and calls-to-bingo", () => {
  const result = playChallenge(identityBoard(), "2026-08-01");
  const card = shareCard(result, "id");
  assert.match(card, new RegExp(`#${result.number}\\b`));
  assert.match(card, new RegExp(`call ke-${result.callsToBingo}\\b`));
});

test("shareCard (en) headline has the challenge number and calls-to-bingo", () => {
  const result = playChallenge(identityBoard(), "2026-08-01");
  const card = shareCard(result, "en");
  assert.match(card, new RegExp(`#${result.number}\\b`));
  assert.match(card, new RegExp(`${result.callsToBingo} calls\\b`));
});

test("shareCard defaults to Indonesian", () => {
  const result = playChallenge(identityBoard(), "2026-08-01");
  assert.equal(shareCard(result), shareCard(result, "id"));
});

test("shareCard renders a headline followed by exactly 5 grid rows of 5 cells", () => {
  const result = playChallenge(identityBoard(), "2026-08-01");
  const lines = shareCard(result).split("\n");
  assert.equal(lines.length, 6); // 1 headline + 5 grid rows
  for (const row of lines.slice(1)) {
    assert.equal([...row].length, 5);
    assert.match(row, /^(?:\u{1F7E9}|\u{2B1C})+$/u);
  }
});

test("shareCard's marked-cell count matches markedAtBingo", () => {
  const result = playChallenge(identityBoard(), "2026-08-01");
  const card = shareCard(result);
  const greenCount = (card.match(/\u{1F7E9}/gu) ?? []).length;
  const expected = result.markedAtBingo.filter(Boolean).length;
  assert.equal(greenCount, expected);
  assert.ok(expected > 0);
});

test("shareCard never leaks board numbers in the grid", () => {
  const result = playChallenge(identityBoard(), "2026-08-01");
  const card = shareCard(result);
  const [, ...gridRows] = card.split("\n");
  for (const row of gridRows) {
    assert.doesNotMatch(row, /[0-9]/);
  }
});

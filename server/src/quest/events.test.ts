import { test } from "node:test";
import assert from "node:assert/strict";
import { type Board, BOARD_SIZE } from "../engine/board.ts";
import { LINES } from "../engine/lines.ts";
import { callNumber, createMatch, type MatchPlayer, type MatchState } from "../engine/match.ts";
import { eventsFromCall, type GameEvent } from "./events.ts";

/** 1..25 in row-major order - see engine/lines.test.ts for why this shape is easy to reason about. */
function identityBoard(): Board {
  return Array.from({ length: BOARD_SIZE }, (_, i) => i + 1);
}

/** 25..1 in row-major order - a valid, unrelated permutation. */
function reversedBoard(): Board {
  return Array.from({ length: BOARD_SIZE }, (_, i) => BOARD_SIZE - i);
}

/** identityBoard shifted by +1 (mod 25): [2,3,...,25,1]. */
function shiftedBoard(): Board {
  return Array.from({ length: BOARD_SIZE }, (_, i) => ((i + 1) % BOARD_SIZE) + 1);
}

test("eventsFromCall emits line_completed for p1 exactly when row0 first becomes fully marked, and nothing for p2", () => {
  const p1: MatchPlayer = { id: "p1", board: identityBoard() };
  // shiftedBoard, not reversedBoard: reversedBoard's row4 is {5,4,3,2,1} -
  // the exact same value set as identityBoard's row0, so it would
  // (correctly, but confusingly for this isolated test) complete at the
  // same instant. shiftedBoard's rows/cols/diagonals never coincide with
  // {1,2,3,4,5} for the filler numbers used below.
  const p2: MatchPlayer = { id: "p2", board: shiftedBoard() };
  let state = createMatch([p1, p2]);

  // p1 needs {1,2,3,4,5} (row0, LINES index 0). p2's fillers (20,21,23,24)
  // never complete any of p2's lines (verified: no line on shiftedBoard is
  // a subset of {1,2,3,4,5,20,21,23,24}).
  const calls: readonly [string, number][] = [
    ["p1", 1],
    ["p2", 20],
    ["p1", 2],
    ["p2", 21],
    ["p1", 3],
    ["p2", 23],
    ["p1", 4],
    ["p2", 24],
    ["p1", 5], // completes p1's row0 right here
  ];

  let lastEvents: GameEvent[] = [];
  for (const [playerId, number] of calls) {
    const prev = state;
    state = callNumber(state, playerId, number);
    lastEvents = eventsFromCall(prev, state);
  }

  assert.deepEqual(lastEvents, [{ type: "line_completed", playerId: "p1", lineIndexes: [0] }]);
});

test("eventsFromCall reports diagonal completion at LINES index 10 (main) / 11 (anti)", () => {
  // Single-player-relevant board: identity board's main diagonal is
  // {1,7,13,19,25} (LINES index 10 per engine/lines.ts buildLines order:
  // 5 rows, then 5 cols, then main diagonal, then anti diagonal).
  const p1: MatchPlayer = { id: "p1", board: identityBoard() };
  const p2: MatchPlayer = { id: "p2", board: reversedBoard() };
  let state = createMatch([p1, p2]);

  const diagonalNumbers = [1, 7, 13, 19, 25];
  let events: GameEvent[] = [];
  for (const n of diagonalNumbers) {
    const callerId = state.players[state.currentTurnIndex]!.id;
    const prev = state;
    state = callNumber(state, callerId, n);
    events = eventsFromCall(prev, state);
  }

  const p1LineEvents = events.filter((e) => e.type === "line_completed" && e.playerId === "p1");
  assert.equal(p1LineEvents.length, 1);
  assert.ok(
    (p1LineEvents[0] as { lineIndexes: readonly number[] }).lineIndexes.includes(10),
    "main diagonal is LINES index 10",
  );
});

test("eventsFromCall never reports the same line twice, and reports match_played/match_won exactly once when the match finishes", () => {
  const p1: MatchPlayer = { id: "p1", board: identityBoard() };
  const p2: MatchPlayer = { id: "p2", board: reversedBoard() };
  let state: MatchState = createMatch([p1, p2]);

  const seenLineIndexes = new Map<string, Set<number>>();
  const allEvents: GameEvent[] = [];

  for (let n = 1; state.status === "in_progress"; n++) {
    const callerId = state.players[state.currentTurnIndex]!.id;
    const prev = state;
    const next = callNumber(prev, callerId, n);
    const events = eventsFromCall(prev, next);
    allEvents.push(...events);

    for (const event of events) {
      if (event.type !== "line_completed") continue;
      const seen = seenLineIndexes.get(event.playerId) ?? new Set<number>();
      for (const index of event.lineIndexes) {
        assert.ok(
          !seen.has(index),
          `line ${index} for ${event.playerId} was reported as newly-completed more than once`,
        );
        seen.add(index);
      }
      seenLineIndexes.set(event.playerId, seen);
    }

    state = next;
  }

  assert.equal(state.status, "finished");

  // Cross-check: every line reported over the whole game matches the
  // ground truth of countCompletedLines-equivalent logic at the final state.
  const calledSet = new Set(state.calledNumbers);
  for (const player of [p1, p2]) {
    const expectedIndexes = LINES.reduce<number[]>((acc, line, i) => {
      if (line.every((index) => calledSet.has(player.board[index]!))) acc.push(i);
      return acc;
    }, []);
    const seen = seenLineIndexes.get(player.id) ?? new Set<number>();
    assert.deepEqual(
      [...seen].sort((a, b) => a - b),
      expectedIndexes,
      `${player.id}'s reported line_completed indexes should match the final board truth`,
    );
  }

  const matchPlayedEvents = allEvents.filter((e) => e.type === "match_played");
  const matchWonEvents = allEvents.filter((e) => e.type === "match_won");

  assert.equal(matchPlayedEvents.length, 2, "match_played fires once per player");
  assert.deepEqual(
    matchPlayedEvents.map((e) => e.playerId).sort(),
    ["p1", "p2"],
  );

  assert.equal(matchWonEvents.length, 1, "match_won fires exactly once");
  assert.equal(matchWonEvents[0]!.playerId, state.winnerId);

  // Both only ever appear on the single transition where the match finished.
  const finishedTransitionEventCount =
    matchPlayedEvents.length + matchWonEvents.length;
  assert.equal(finishedTransitionEventCount, 3);
});

test("eventsFromCall returns an empty array for a call that completes no line and does not finish the match", () => {
  const p1: MatchPlayer = { id: "p1", board: identityBoard() };
  const p2: MatchPlayer = { id: "p2", board: reversedBoard() };
  const prev = createMatch([p1, p2]);

  const next = callNumber(prev, "p1", 1);
  assert.deepEqual(eventsFromCall(prev, next), []);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { type Board, BOARD_SIZE } from "./board.ts";
import { countCompletedLines } from "./lines.ts";
import { callNumber, createMatch, type MatchPlayer, type MatchState } from "./match.ts";

/** 1..25 in row-major order. */
function identityBoard(): Board {
  return Array.from({ length: BOARD_SIZE }, (_, i) => i + 1);
}

/** 25..1 in row-major order - still a valid, unrelated permutation. */
function reversedBoard(): Board {
  return Array.from({ length: BOARD_SIZE }, (_, i) => BOARD_SIZE - i);
}

/** identityBoard shifted by +1 (mod 25): [2,3,...,25,1]. */
function shiftedBoard(): Board {
  return Array.from({ length: BOARD_SIZE }, (_, i) => ((i + 1) % BOARD_SIZE) + 1);
}

/**
 * Plays numbers 1..upTo in ascending order, alternating strictly between
 * two players starting with the first (matching createMatch's initial
 * currentTurnIndex 0). Used by the win-detection tests below: for both an
 * identity board and any board built the same "sequential" way (reversed,
 * shifted), completed-line counts only depend on the *set* of called
 * numbers, so driving with a fixed ascending sequence keeps the tests
 * deterministic and easy to hand-verify.
 */
function playAscending(state: MatchState, upTo: number): MatchState {
  let next = state;
  for (let n = 1; n <= upTo; n++) {
    const callerId = next.players[next.currentTurnIndex]!.id;
    next = callNumber(next, callerId, n);
  }
  return next;
}

test("createMatch accepts 2 players", () => {
  const players: MatchPlayer[] = [
    { id: "p1", board: identityBoard() },
    { id: "p2", board: reversedBoard() },
  ];
  const state = createMatch(players);
  assert.equal(state.status, "in_progress");
  assert.equal(state.currentTurnIndex, 0);
  assert.deepEqual(state.calledNumbers, []);
});

test("createMatch accepts 8 players", () => {
  const players: MatchPlayer[] = Array.from({ length: 8 }, (_, i) => ({
    id: `p${i + 1}`,
    board: identityBoard(),
  }));
  const state = createMatch(players);
  assert.equal(state.players.length, 8);
  assert.equal(state.status, "in_progress");
});

test("createMatch rejects fewer than 2 players", () => {
  assert.throws(() => createMatch([{ id: "p1", board: identityBoard() }]), /2 and 8/);
});

test("createMatch rejects more than 8 players", () => {
  const players: MatchPlayer[] = Array.from({ length: 9 }, (_, i) => ({
    id: `p${i + 1}`,
    board: identityBoard(),
  }));
  assert.throws(() => createMatch(players), /2 and 8/);
});

test("createMatch rejects an invalid board", () => {
  const badBoard = identityBoard().slice(0, 24); // only 24 numbers
  assert.throws(
    () =>
      createMatch([
        { id: "p1", board: badBoard },
        { id: "p2", board: identityBoard() },
      ]),
    /Invalid board for player p1/,
  );
});

test("callNumber rejects a call from the player who is not on turn", () => {
  const state = createMatch([
    { id: "p1", board: identityBoard() },
    { id: "p2", board: reversedBoard() },
  ]);
  assert.throws(() => callNumber(state, "p2", 5), /not p2's turn/);
});

test("callNumber rejects a call from an unknown player id", () => {
  const state = createMatch([
    { id: "p1", board: identityBoard() },
    { id: "p2", board: reversedBoard() },
  ]);
  assert.throws(() => callNumber(state, "ghost", 5), /unknown player/i);
});

test("callNumber rejects a number that was already called", () => {
  let state = createMatch([
    { id: "p1", board: identityBoard() },
    { id: "p2", board: reversedBoard() },
  ]);
  state = callNumber(state, "p1", 5);
  assert.throws(() => callNumber(state, "p2", 5), /already been called/);
});

test("callNumber rejects numbers outside 1-25", () => {
  const state = createMatch([
    { id: "p1", board: identityBoard() },
    { id: "p2", board: reversedBoard() },
  ]);
  assert.throws(() => callNumber(state, "p1", 0), /between 1 and 25/);
  assert.throws(() => callNumber(state, "p1", 26), /between 1 and 25/);
  assert.throws(() => callNumber(state, "p1", 3.5), /between 1 and 25/);
});

test("callNumber marks the called number for every board, regardless of who called it", () => {
  const p1: MatchPlayer = { id: "p1", board: identityBoard() };
  const p2: MatchPlayer = { id: "p2", board: reversedBoard() };
  let state = createMatch([p1, p2]);

  // p1 needs {1,2,3,4,5} (row0) to complete a line. p2 calls the "5" on
  // p2's own turn - proving the mark isn't scoped to whoever called it.
  state = callNumber(state, "p1", 1);
  state = callNumber(state, "p2", 5);
  state = callNumber(state, "p1", 2);
  state = callNumber(state, "p2", 20); // filler, irrelevant to either board
  state = callNumber(state, "p1", 3);
  state = callNumber(state, "p2", 21); // filler
  state = callNumber(state, "p1", 4);

  assert.equal(state.status, "in_progress");
  assert.ok(state.calledNumbers.includes(5), "number called by p2 is in shared calledNumbers");
  assert.equal(countCompletedLines(p1.board, new Set(state.calledNumbers)), 1);
});

test("callNumber advances turns in order and wraps around", () => {
  const players: MatchPlayer[] = [
    { id: "p1", board: identityBoard() },
    { id: "p2", board: identityBoard() },
    { id: "p3", board: identityBoard() },
  ];
  let state = createMatch(players);
  assert.equal(state.currentTurnIndex, 0);

  state = callNumber(state, "p1", 1);
  assert.equal(state.currentTurnIndex, 1);

  state = callNumber(state, "p2", 2);
  assert.equal(state.currentTurnIndex, 2);

  state = callNumber(state, "p3", 3);
  assert.equal(state.currentTurnIndex, 0, "turn wraps back to the first player");

  state = callNumber(state, "p1", 4);
  assert.equal(state.currentTurnIndex, 1);
  assert.equal(state.status, "in_progress");
});

test("callNumber declares a winner once a player completes the 5th line", () => {
  const p1: MatchPlayer = { id: "p1", board: identityBoard() };
  const p2: MatchPlayer = { id: "p2", board: reversedBoard() };
  const initial = createMatch([p1, p2]);

  // Calling 1..25 ascending, alternating turns starting with p1: p1's
  // identity board crosses 5 completed lines (4 rows + col0 + the anti
  // diagonal all resolve once "21" is called) exactly on call #21, which
  // - since calls strictly alternate starting with p1 - is p1's call.
  const before = playAscending(initial, 20);
  assert.equal(before.status, "in_progress");

  const after = callNumber(before, "p1", 21);
  assert.equal(after.status, "finished");
  assert.equal(after.winnerId, "p1");
  assert.ok(countCompletedLines(p1.board, new Set(after.calledNumbers)) >= 5);
});

test("match cannot accept more calls once it has finished", () => {
  const p1: MatchPlayer = { id: "p1", board: identityBoard() };
  const p2: MatchPlayer = { id: "p2", board: reversedBoard() };
  const initial = createMatch([p1, p2]);
  const finished = playAscending(initial, 21);
  assert.equal(finished.status, "finished");

  assert.throws(() => callNumber(finished, "p2", 22), /already finished/);
});

test("when multiple players reach 5 lines on the same call, the caller wins the tie", () => {
  const p1: MatchPlayer = { id: "p1", board: identityBoard() };
  const p2: MatchPlayer = { id: "p2", board: shiftedBoard() };
  const initial = createMatch([p1, p2]);

  const before = playAscending(initial, 20);
  assert.equal(before.status, "in_progress");

  // p1's board and p2's shifted board both cross the 5-line threshold the
  // instant "21" is called - a genuine simultaneous completion. p1 is the
  // caller (alternating turns starting at p1, call #21 is odd), so p1
  // must win despite p2 reaching the threshold on the exact same call.
  const after = callNumber(before, "p1", 21);
  const calledSet = new Set(after.calledNumbers);

  assert.equal(after.status, "finished");
  assert.ok(countCompletedLines(p1.board, calledSet) >= 5, "p1 really did reach 5 lines");
  assert.ok(countCompletedLines(p2.board, calledSet) >= 5, "p2 also reached 5 lines on this call");
  assert.equal(after.winnerId, "p1", "the caller wins ties");
});

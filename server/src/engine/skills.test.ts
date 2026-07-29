import { test } from "node:test";
import assert from "node:assert/strict";
import { type Board, BOARD_SIZE } from "./board.ts";
import { countCompletedLinesForPlayer, markedCellsFor } from "./lines.ts";
import { callNumber, createMatch, type MatchPlayer, type MatchState, type SkillInstance } from "./match.ts";
import {
  CELL_SWAP,
  DOUBLE_CALL,
  GHOST_CALL,
  NULLIFY,
  respondToSkill,
  useSkill,
  WILD_DAUB,
} from "./skills.ts";

/** 1..25 in row-major order. */
function identityBoard(): Board {
  return Array.from({ length: BOARD_SIZE }, (_, i) => i + 1);
}

/**
 * A board where 21-25 sit on the main diagonal (indices 0,6,12,18,24).
 * Every one of the 12 lines (5 rows, 5 cols, both diagonals) passes
 * through exactly one main-diagonal index (the two diagonals share index
 * 12), so every line contains at least one of {21..25}. As long as a test
 * only ever calls numbers 1-20, a board built this way can never complete
 * a line - handy as a "safe" opponent board so tests that drive many
 * low-numbered calls don't have to reason about the opponent accidentally
 * completing lines (or winning) as a side effect.
 */
function safeOpponentBoard(): Board {
  const board = new Array<number>(BOARD_SIZE);
  const diagIndices = [0, 6, 12, 18, 24];
  const diagValues = [21, 22, 23, 24, 25];
  diagIndices.forEach((idx, i) => {
    board[idx] = diagValues[i]!;
  });
  let filler = 1;
  for (let i = 0; i < BOARD_SIZE; i++) {
    if (!diagIndices.includes(i)) board[i] = filler++;
  }
  return board;
}

function skill(effectType: string, chargesLeft = 1): SkillInstance {
  return { effectType, chargesLeft };
}

/** Builds a match via createMatch, routing each player's optional
 *  `loadout` through opts.loadouts (the only sanctioned way to seed a
 *  starting loadout - see match.ts's createMatch). */
function makeMatch(
  players: readonly { id: string; board: Board; loadout?: readonly SkillInstance[] }[],
): MatchState {
  const loadouts: Record<string, readonly SkillInstance[]> = {};
  for (const p of players) {
    if (p.loadout) loadouts[p.id] = p.loadout;
  }
  return createMatch(
    players.map((p) => ({ id: p.id, board: p.board })),
    { loadouts },
  );
}

/** Calls `numbers` in order, each time letting whoever currently holds the
 *  turn make the call (rather than hard-coding which player calls which
 *  number) - works regardless of arming (Double/Ghost) changing whose turn
 *  it is next. */
function callSequence(state: MatchState, numbers: readonly number[]): MatchState {
  let next = state;
  for (const n of numbers) {
    const callerId = next.players[next.currentTurnIndex]!.id;
    next = callNumber(next, callerId, n);
  }
  return next;
}

function playerIn(state: MatchState, id: string): MatchPlayer {
  const player = state.players.find((p) => p.id === id);
  if (!player) throw new Error(`test setup error: no player ${id}`);
  return player;
}

// -- createMatch / baseline defaults ----------------------------------

test("createMatch defaults every player's skill state to empty/false when no loadouts are given", () => {
  const state = createMatch([
    { id: "p1", board: identityBoard() },
    { id: "p2", board: safeOpponentBoard() },
  ]);
  assert.equal(state.skillUsedThisTurn, false);
  assert.equal(state.pendingSkill, undefined);
  assert.equal(state.armed, undefined);
  for (const player of state.players) {
    assert.deepEqual(player.loadout, []);
    assert.deepEqual(player.daubedCells, []);
    assert.deepEqual(player.ghostNumbers, []);
  }
});

test("createMatch(players, opts) seeds each player's loadout from opts.loadouts by id", () => {
  const state = makeMatch([
    { id: "p1", board: identityBoard(), loadout: [skill(WILD_DAUB), skill(NULLIFY)] },
    { id: "p2", board: safeOpponentBoard() },
  ]);
  assert.deepEqual(playerIn(state, "p1").loadout, [skill(WILD_DAUB), skill(NULLIFY)]);
  assert.deepEqual(playerIn(state, "p2").loadout, []);
});

// -- useSkill: generic validation --------------------------------------

test("useSkill rejects a skill use from the player who is not on turn", () => {
  const state = makeMatch([
    { id: "p1", board: identityBoard(), loadout: [skill(WILD_DAUB)] },
    { id: "p2", board: safeOpponentBoard(), loadout: [skill(WILD_DAUB)] },
  ]);
  assert.throws(() => useSkill(state, "p2", WILD_DAUB, { cellIndex: 0 }), /not p2's turn/);
});

test("useSkill rejects an unknown player id", () => {
  const state = makeMatch([
    { id: "p1", board: identityBoard(), loadout: [skill(WILD_DAUB)] },
    { id: "p2", board: safeOpponentBoard() },
  ]);
  assert.throws(() => useSkill(state, "ghost", WILD_DAUB, {}), /unknown player/i);
});

test("useSkill rejects once the match has finished", () => {
  let state = makeMatch([
    { id: "p1", board: identityBoard(), loadout: [skill(WILD_DAUB)] },
    { id: "p2", board: safeOpponentBoard() },
  ]);
  state = callSequence(state, Array.from({ length: 20 }, (_, i) => i + 1));
  state = useSkill(state, "p1", WILD_DAUB, { cellIndex: 20 }); // wins (see WILD_DAUB win test below)
  assert.equal(state.status, "finished");
  assert.throws(() => useSkill(state, "p1", WILD_DAUB, { cellIndex: 21 }), /already finished/);
});

test("useSkill rejects a player without an available charge for that effectType", () => {
  const state = makeMatch([
    { id: "p1", board: identityBoard() }, // no loadout at all - casual
    { id: "p2", board: safeOpponentBoard() },
  ]);
  assert.throws(() => useSkill(state, "p1", WILD_DAUB, { cellIndex: 0 }), /no available charge/);
});

test("useSkill rejects a skill the player holds but with 0 charges left", () => {
  const state = makeMatch([
    { id: "p1", board: identityBoard(), loadout: [skill(WILD_DAUB, 0)] },
    { id: "p2", board: safeOpponentBoard() },
  ]);
  assert.throws(() => useSkill(state, "p1", WILD_DAUB, { cellIndex: 0 }), /no available charge/);
});

test("useSkill consumes the charge immediately - a second use of the same skill fails even after the effect resolved", () => {
  let state = makeMatch([
    { id: "p1", board: identityBoard(), loadout: [skill(WILD_DAUB, 1)] },
    { id: "p2", board: safeOpponentBoard() },
  ]);
  state = useSkill(state, "p1", WILD_DAUB, { cellIndex: 0 });
  assert.equal(playerIn(state, "p1").loadout![0]!.chargesLeft, 0);
  state = callNumber(state, "p1", 10); // end the turn so skillUsedThisTurn doesn't mask the real check
  state = callNumber(state, "p2", 11);
  assert.throws(() => useSkill(state, "p1", WILD_DAUB, { cellIndex: 1 }), /no available charge/);
});

test("useSkill rejects a second skill in the same turn (max 1 skill per turn)", () => {
  const state = makeMatch([
    { id: "p1", board: identityBoard(), loadout: [skill(WILD_DAUB), skill(CELL_SWAP)] },
    { id: "p2", board: safeOpponentBoard() },
  ]);
  const afterFirst = useSkill(state, "p1", WILD_DAUB, { cellIndex: 0 });
  assert.equal(afterFirst.skillUsedThisTurn, true);
  assert.throws(
    () => useSkill(afterFirst, "p1", CELL_SWAP, { a: 1, b: 2 }),
    /already used a skill this turn/,
  );
});

test("useSkill rejects NULLIFY - it can only be used to respond to a pending skill", () => {
  const state = makeMatch([
    { id: "p1", board: identityBoard(), loadout: [skill(NULLIFY)] },
    { id: "p2", board: safeOpponentBoard() },
  ]);
  assert.throws(() => useSkill(state, "p1", NULLIFY, {}), /NULLIFY cannot be used via useSkill/);
});

test("useSkill rejects an unknown effectType", () => {
  const state = makeMatch([
    { id: "p1", board: identityBoard(), loadout: [skill("TELEPORT")] },
    { id: "p2", board: safeOpponentBoard() },
  ]);
  assert.throws(() => useSkill(state, "p1", "TELEPORT", {}), /Unknown skill effectType/);
});

test("useSkill and callNumber are both rejected while a skill is pending a Nullify decision", () => {
  const state = makeMatch([
    { id: "p1", board: identityBoard(), loadout: [skill(WILD_DAUB), skill(CELL_SWAP)] },
    { id: "p2", board: safeOpponentBoard(), loadout: [skill(NULLIFY)] },
  ]);
  const pending = useSkill(state, "p1", WILD_DAUB, { cellIndex: 0 });
  assert.deepEqual(pending.pendingSkill?.awaiting, ["p2"]);
  assert.throws(() => callNumber(pending, "p1", 1), /pending a Nullify decision/);
  assert.throws(() => useSkill(pending, "p1", CELL_SWAP, { a: 1, b: 2 }), /already pending/);
});

// -- WILD_DAUB -----------------------------------------------------------

test("useSkill WILD_DAUB daubs a cell immediately when no opponent can Nullify", () => {
  let state = makeMatch([
    { id: "p1", board: identityBoard(), loadout: [skill(WILD_DAUB)] },
    { id: "p2", board: safeOpponentBoard() }, // no NULLIFY -> no window
  ]);
  state = useSkill(state, "p1", WILD_DAUB, { cellIndex: 10 });
  assert.equal(state.pendingSkill, undefined);
  assert.equal(state.skillUsedThisTurn, true);
  const p1 = playerIn(state, "p1");
  assert.deepEqual(p1.daubedCells, [10]);
  assert.equal(p1.loadout![0]!.chargesLeft, 0);
});

test("useSkill WILD_DAUB rejects an out-of-range or non-integer cellIndex", () => {
  const state = makeMatch([
    { id: "p1", board: identityBoard(), loadout: [skill(WILD_DAUB)] },
    { id: "p2", board: safeOpponentBoard() },
  ]);
  assert.throws(() => useSkill(state, "p1", WILD_DAUB, { cellIndex: -1 }), /between 0 and 24/);
  assert.throws(() => useSkill(state, "p1", WILD_DAUB, { cellIndex: 25 }), /between 0 and 24/);
  assert.throws(() => useSkill(state, "p1", WILD_DAUB, { cellIndex: 1.5 }), /between 0 and 24/);
  assert.throws(() => useSkill(state, "p1", WILD_DAUB, {}), /between 0 and 24/);
});

test("useSkill WILD_DAUB rejects a cell that's already marked (called publicly)", () => {
  let state = makeMatch([
    { id: "p1", board: identityBoard(), loadout: [skill(WILD_DAUB)] },
    { id: "p2", board: safeOpponentBoard() },
  ]);
  state = callNumber(state, "p1", 1); // marks value 1, which sits at index 0
  state = callNumber(state, "p2", 2);
  assert.throws(() => useSkill(state, "p1", WILD_DAUB, { cellIndex: 0 }), /already marked/);
});

test("useSkill WILD_DAUB rejects a cell that's already daubed", () => {
  const state = makeMatch([
    { id: "p1", board: identityBoard(), loadout: [skill(WILD_DAUB, 2)] },
    { id: "p2", board: safeOpponentBoard() },
  ]);
  const afterFirst = useSkill(state, "p1", WILD_DAUB, { cellIndex: 5 });
  const nextTurn = { ...afterFirst, skillUsedThisTurn: false }; // simulate a later turn, same daub still stands
  assert.throws(() => useSkill(nextTurn, "p1", WILD_DAUB, { cellIndex: 5 }), /already marked/);
});

test("WILD_DAUB completes the 5th line and wins immediately, without a call", () => {
  // 1..20 called (alternating, safe opponent) gives p1's identity board
  // exactly 4 completed lines (rows 0-3) - same math as match.test.ts's
  // "declares a winner" test, which shows call 21 completes column0
  // {1,6,11,16,21} AND the anti-diagonal {5,9,13,17,21} at once. Daubing
  // index 20 (where "21" sits) achieves the same double-completion
  // without ever calling 21.
  let state = makeMatch([
    { id: "p1", board: identityBoard(), loadout: [skill(WILD_DAUB)] },
    { id: "p2", board: safeOpponentBoard() },
  ]);
  state = callSequence(state, Array.from({ length: 20 }, (_, i) => i + 1));
  assert.equal(state.status, "in_progress");
  assert.equal(state.currentTurnIndex, 0, "back to p1's turn after 20 alternating calls");

  state = useSkill(state, "p1", WILD_DAUB, { cellIndex: 20 });

  assert.equal(state.status, "finished");
  assert.equal(state.winnerId, "p1");
});

// -- DOUBLE_CALL -----------------------------------------------------------

test("DOUBLE_CALL arms two calls this turn; the turn only advances after the second", () => {
  let state = makeMatch([
    { id: "p1", board: identityBoard(), loadout: [skill(DOUBLE_CALL)] },
    { id: "p2", board: safeOpponentBoard() },
  ]);
  state = useSkill(state, "p1", DOUBLE_CALL, {});
  assert.deepEqual(state.armed, { playerId: "p1", double: { callsLeft: 2 } });
  assert.equal(state.skillUsedThisTurn, true);
  assert.equal(state.currentTurnIndex, 0);

  state = callNumber(state, "p1", 1);
  assert.equal(state.currentTurnIndex, 0, "turn has not advanced after the first of two calls");
  assert.equal(state.armed?.double?.callsLeft, 1);
  assert.throws(() => callNumber(state, "p2", 2), /not p2's turn/);

  state = callNumber(state, "p1", 2);
  assert.equal(state.currentTurnIndex, 1, "turn advances after the second call");
  assert.equal(state.armed, undefined);
  assert.equal(state.skillUsedThisTurn, false);
  assert.deepEqual(state.calledNumbers, [1, 2]);
});

test("DOUBLE_CALL: a win on the first call finishes the match and cancels the second call", () => {
  let state = makeMatch([
    { id: "p1", board: identityBoard(), loadout: [skill(DOUBLE_CALL)] },
    { id: "p2", board: safeOpponentBoard() },
  ]);
  state = callSequence(state, Array.from({ length: 20 }, (_, i) => i + 1));
  state = useSkill(state, "p1", DOUBLE_CALL, {});
  state = callNumber(state, "p1", 21); // completes column0 + anti-diagonal at once
  assert.equal(state.status, "finished");
  assert.equal(state.winnerId, "p1");
  assert.throws(() => callNumber(state, "p1", 22), /already finished/);
});

// -- GHOST_CALL -----------------------------------------------------------

test("GHOST_CALL marks the next call only in the caller's own ghostNumbers, not the shared calledNumbers, and the turn advances normally", () => {
  let state = makeMatch([
    { id: "p1", board: identityBoard(), loadout: [skill(GHOST_CALL)] },
    { id: "p2", board: safeOpponentBoard() },
  ]);
  state = useSkill(state, "p1", GHOST_CALL, {});
  assert.deepEqual(state.armed, { playerId: "p1", ghost: true });

  state = callNumber(state, "p1", 4);
  assert.ok(!state.calledNumbers.includes(4), "the ghost call does not enter the shared calledNumbers");
  assert.deepEqual(playerIn(state, "p1").ghostNumbers, [4]);
  assert.equal(state.currentTurnIndex, 1, "a single ghost call still ends the turn like a normal call");
  assert.equal(state.armed, undefined);
});

test("GHOST_CALL: another player can later call the same number publicly - it becomes shared, and is a no-op for the ghost-caller", () => {
  let state = makeMatch([
    { id: "p1", board: identityBoard(), loadout: [skill(GHOST_CALL)] },
    { id: "p2", board: safeOpponentBoard() },
  ]);
  state = useSkill(state, "p1", GHOST_CALL, {});
  state = callNumber(state, "p1", 4); // ghost-marks 4 for p1 only; turn -> p2

  const p1Before = playerIn(state, "p1");
  const linesBefore = countCompletedLinesForPlayer(
    p1Before.board,
    new Set(state.calledNumbers),
    new Set(p1Before.ghostNumbers),
    p1Before.daubedCells ?? [],
  );

  state = callNumber(state, "p2", 4); // p2 calls the same number publicly - must succeed
  assert.ok(state.calledNumbers.includes(4), "4 is now publicly called");

  const p1After = playerIn(state, "p1");
  assert.deepEqual(p1After.ghostNumbers, [4], "p1's own ghost record is untouched");
  const linesAfter = countCompletedLinesForPlayer(
    p1After.board,
    new Set(state.calledNumbers),
    new Set(p1After.ghostNumbers ?? []),
    p1After.daubedCells ?? [],
  );
  assert.equal(linesAfter, linesBefore, "no-op for the ghost-caller: 4 already counted via ghostNumbers");
});

test("GHOST_CALL rejects a number that has already been called publicly", () => {
  let state = makeMatch([
    { id: "p1", board: identityBoard(), loadout: [skill(GHOST_CALL)] },
    { id: "p2", board: safeOpponentBoard() },
  ]);
  state = callNumber(state, "p1", 1);
  state = callNumber(state, "p2", 2);
  state = useSkill(state, "p1", GHOST_CALL, {});
  assert.throws(() => callNumber(state, "p1", 1), /already been called/);
});

test("GHOST_CALL rejects a number that's already one of the caller's own ghost numbers", () => {
  let state = makeMatch([
    { id: "p1", board: identityBoard(), loadout: [skill(GHOST_CALL, 2)] },
    { id: "p2", board: safeOpponentBoard() },
  ]);
  state = useSkill(state, "p1", GHOST_CALL, {});
  state = callNumber(state, "p1", 1); // ghost-marks 1; turn -> p2
  state = callNumber(state, "p2", 2); // filler; turn -> p1
  state = useSkill(state, "p1", GHOST_CALL, {}); // 2nd charge
  assert.throws(() => callNumber(state, "p1", 1), /ghost numbers/);
});

// -- CELL_SWAP -----------------------------------------------------------

test("useSkill CELL_SWAP swaps the numbers at two of the caster's own board positions", () => {
  let state = makeMatch([
    { id: "p1", board: identityBoard(), loadout: [skill(CELL_SWAP)] },
    { id: "p2", board: safeOpponentBoard() },
  ]);
  state = useSkill(state, "p1", CELL_SWAP, { a: 0, b: 1 });
  const p1 = playerIn(state, "p1");
  assert.equal(p1.board[0], 2);
  assert.equal(p1.board[1], 1);
  assert.equal(state.pendingSkill, undefined, "CELL_SWAP never opens a Nullify window");
});

test("useSkill CELL_SWAP rejects invalid args (out of range, or a === b)", () => {
  const state = makeMatch([
    { id: "p1", board: identityBoard(), loadout: [skill(CELL_SWAP, 3)] },
    { id: "p2", board: safeOpponentBoard() },
  ]);
  assert.throws(() => useSkill(state, "p1", CELL_SWAP, { a: 0, b: 0 }), /distinct/);
  assert.throws(() => useSkill(state, "p1", CELL_SWAP, { a: -1, b: 2 }), /between 0 and 24/);
  assert.throws(() => useSkill(state, "p1", CELL_SWAP, { a: 0, b: 25 }), /between 0 and 24/);
  assert.throws(() => useSkill(state, "p1", CELL_SWAP, { a: 0 }), /between 0 and 24/);
});

test("CELL_SWAP resolves immediately even when an opponent holds a NULLIFY charge (its counter is '-' per CONCEPT.md)", () => {
  let state = makeMatch([
    { id: "p1", board: identityBoard(), loadout: [skill(CELL_SWAP)] },
    { id: "p2", board: safeOpponentBoard(), loadout: [skill(NULLIFY)] },
  ]);
  state = useSkill(state, "p1", CELL_SWAP, { a: 2, b: 3 });
  assert.equal(state.pendingSkill, undefined);
  assert.equal(playerIn(state, "p1").board[2], 4);
  assert.equal(playerIn(state, "p1").board[3], 3);
  assert.equal(playerIn(state, "p2").loadout![0]!.chargesLeft, 1, "p2 never got a chance to Nullify");
});

test("CELL_SWAP: a Wild-Daubed cell keeps its daub after swap (daub is position-based, not value-based); mark follows the number", () => {
  let state = makeMatch([
    { id: "p1", board: identityBoard(), loadout: [skill(WILD_DAUB), skill(CELL_SWAP)] },
    { id: "p2", board: safeOpponentBoard() },
  ]);
  state = useSkill(state, "p1", WILD_DAUB, { cellIndex: 0 }); // daub position 0 (currently holds "1")
  state = callNumber(state, "p1", 10); // end p1's turn with an ordinary call
  state = callNumber(state, "p2", 11); // p2's turn
  state = useSkill(state, "p1", CELL_SWAP, { a: 0, b: 1 }); // swap positions 0 and 1

  const p1 = playerIn(state, "p1");
  assert.deepEqual(p1.daubedCells, [0], "the daub stays at position 0");
  assert.equal(p1.board[0], 2, "position 0 now holds the number 2 (swapped)");
  assert.equal(p1.board[1], 1, "position 1 now holds the number 1 (swapped)");

  const marked = markedCellsFor(p1.board, new Set(state.calledNumbers), new Set(), p1.daubedCells ?? []);
  assert.equal(marked[0], true, "position 0 is marked via the daub, even though its number (2) was never called");
  assert.equal(marked[1], false, "position 1 holds the number 1, never called and not daubed");
});

test("CELL_SWAP can complete the 5th line and win", () => {
  // Custom board (not identityBoard): rows 0-2 are 1-15 in order, and the
  // main diagonal (indices 0,6,12,18,24) is completed by placing 16 at
  // index 18 and 17 at index 24. Calling 1..19 therefore gives p1 exactly
  // 4 completed lines: row0, row1, row2, main diagonal.
  //
  // column0 (indices 0,5,10,15,20 = values 1,6,11,18,22) is then 4/5
  // complete - everything but index 20 (value 22, never called) is
  // called. index 16 (row3, value 19) is NOT part of any of the 4
  // completed lines (nor of column0), so swapping it with index 20 moves
  // an already-called number (19) into column0's last empty slot,
  // completing column0 as the 5th line - without disturbing row0-2 or the
  // main diagonal.
  const p1Board: number[] = [
    1, 2, 3, 4, 5, // row0
    6, 7, 8, 9, 10, // row1
    11, 12, 13, 14, 15, // row2
    18, 19, 20, 16, 21, // row3 (index 18 = 16, completes the main diagonal)
    22, 23, 24, 25, 17, // row4 (index 24 = 17, completes the main diagonal)
  ];

  let state = makeMatch([
    { id: "p1", board: p1Board, loadout: [skill(CELL_SWAP)] },
    { id: "p2", board: safeOpponentBoard() },
  ]);
  state = callSequence(state, Array.from({ length: 20 }, (_, i) => i + 1)); // 1..20

  const p1BeforeSwap = playerIn(state, "p1");
  assert.equal(state.status, "in_progress");
  assert.equal(
    countCompletedLinesForPlayer(p1BeforeSwap.board, new Set(state.calledNumbers), new Set(), []),
    4,
    "row0, row1, row2 and the main diagonal are complete; column0 is one short",
  );
  assert.equal(state.currentTurnIndex, 0, "back to p1's turn after 20 alternating calls");

  state = useSkill(state, "p1", CELL_SWAP, { a: 16, b: 20 });

  assert.equal(state.status, "finished");
  assert.equal(state.winnerId, "p1");
});

// -- NULLIFY / pendingSkill flow -----------------------------------------

test("a nullifiable skill with no NULLIFY-capable opponent resolves immediately (no pendingSkill)", () => {
  const state = makeMatch([
    { id: "p1", board: identityBoard(), loadout: [skill(WILD_DAUB)] },
    { id: "p2", board: safeOpponentBoard() }, // no NULLIFY
  ]);
  const next = useSkill(state, "p1", WILD_DAUB, { cellIndex: 0 });
  assert.equal(next.pendingSkill, undefined);
  assert.deepEqual(playerIn(next, "p1").daubedCells, [0]);
});

test("a nullifiable skill only lists opponents who actually hold an available NULLIFY charge", () => {
  const state = makeMatch([
    { id: "p1", board: identityBoard(), loadout: [skill(WILD_DAUB)] },
    { id: "p2", board: safeOpponentBoard(), loadout: [skill(NULLIFY)] },
    { id: "p3", board: safeOpponentBoard(), loadout: [skill(NULLIFY, 0)] }, // no charge left
    { id: "p4", board: safeOpponentBoard() }, // no NULLIFY at all
  ]);
  const next = useSkill(state, "p1", WILD_DAUB, { cellIndex: 0 });
  assert.deepEqual(next.pendingSkill?.awaiting, ["p2"]);
});

test("Nullify cancels a pending WILD_DAUB: no daub applied, both sides' charges are consumed, effect never resolves", () => {
  let state = makeMatch([
    { id: "p1", board: identityBoard(), loadout: [skill(WILD_DAUB)] },
    { id: "p2", board: safeOpponentBoard(), loadout: [skill(NULLIFY)] },
  ]);
  state = useSkill(state, "p1", WILD_DAUB, { cellIndex: 0 });
  assert.deepEqual(state.pendingSkill?.awaiting, ["p2"]);
  assert.equal(playerIn(state, "p1").loadout![0]!.chargesLeft, 0, "caster's charge is already spent");

  state = respondToSkill(state, "p2", true);

  assert.equal(state.pendingSkill, undefined);
  assert.deepEqual(playerIn(state, "p1").daubedCells, [], "the daub never applied");
  assert.equal(playerIn(state, "p1").loadout![0]!.chargesLeft, 0, "Nullify does not refund the caster's charge");
  assert.equal(playerIn(state, "p2").loadout![0]!.chargesLeft, 0, "the responder's own NULLIFY charge is consumed");
});

test("passing (not Nullifying) resolves the skill once every awaiting opponent has responded", () => {
  let state = makeMatch([
    { id: "p1", board: identityBoard(), loadout: [skill(WILD_DAUB)] },
    { id: "p2", board: safeOpponentBoard(), loadout: [skill(NULLIFY)] },
    { id: "p3", board: safeOpponentBoard(), loadout: [skill(NULLIFY)] },
  ]);
  state = useSkill(state, "p1", WILD_DAUB, { cellIndex: 0 });
  assert.deepEqual([...state.pendingSkill!.awaiting].sort(), ["p2", "p3"]);

  state = respondToSkill(state, "p2", false);
  assert.deepEqual(state.pendingSkill?.awaiting, ["p3"]);
  assert.deepEqual(playerIn(state, "p1").daubedCells, [], "not resolved yet - p3 still hasn't answered");

  state = respondToSkill(state, "p3", false);
  assert.equal(state.pendingSkill, undefined);
  assert.deepEqual(playerIn(state, "p1").daubedCells, [0], "resolved once everyone passed");
});

test("two NULLIFY-capable opponents: one Nullifying is enough, the second can no longer respond", () => {
  let state = makeMatch([
    { id: "p1", board: identityBoard(), loadout: [skill(WILD_DAUB)] },
    { id: "p2", board: safeOpponentBoard(), loadout: [skill(NULLIFY)] },
    { id: "p3", board: safeOpponentBoard(), loadout: [skill(NULLIFY)] },
  ]);
  state = useSkill(state, "p1", WILD_DAUB, { cellIndex: 0 });
  state = respondToSkill(state, "p2", true);

  assert.equal(state.pendingSkill, undefined);
  assert.deepEqual(playerIn(state, "p1").daubedCells, []);
  assert.throws(() => respondToSkill(state, "p3", false), /no skill is pending/i);
  assert.equal(playerIn(state, "p3").loadout![0]!.chargesLeft, 1, "p3 never got to spend their charge");
});

test("respondToSkill rejects when nothing is pending", () => {
  const state = makeMatch([
    { id: "p1", board: identityBoard() },
    { id: "p2", board: safeOpponentBoard(), loadout: [skill(NULLIFY)] },
  ]);
  assert.throws(() => respondToSkill(state, "p2", false), /no skill is pending/i);
});

test("respondToSkill rejects a player who is not in the pending skill's awaiting list", () => {
  const state = makeMatch([
    { id: "p1", board: identityBoard(), loadout: [skill(WILD_DAUB)] },
    { id: "p2", board: safeOpponentBoard(), loadout: [skill(NULLIFY)] },
    { id: "p3", board: safeOpponentBoard() }, // no NULLIFY - never entered awaiting
  ]);
  const pending = useSkill(state, "p1", WILD_DAUB, { cellIndex: 0 });
  assert.throws(() => respondToSkill(pending, "p3", false), /not awaiting/);
  assert.throws(() => respondToSkill(pending, "p1", false), /not awaiting/, "the caster itself never awaits");
});

test("DOUBLE_CALL Nullified: the caller still just calls once, normally, on their turn", () => {
  let state = makeMatch([
    { id: "p1", board: identityBoard(), loadout: [skill(DOUBLE_CALL)] },
    { id: "p2", board: safeOpponentBoard(), loadout: [skill(NULLIFY)] },
  ]);
  state = useSkill(state, "p1", DOUBLE_CALL, {});
  assert.deepEqual(state.pendingSkill?.awaiting, ["p2"]);
  state = respondToSkill(state, "p2", true);

  assert.equal(state.pendingSkill, undefined);
  assert.equal(state.armed, undefined, "Double Call never got armed");

  state = callNumber(state, "p1", 1);
  assert.equal(state.currentTurnIndex, 1, "a single, ordinary call ends the turn");
  assert.deepEqual(state.calledNumbers, [1]);
});

test("GHOST_CALL Nullified: the next call goes to the shared calledNumbers as normal", () => {
  let state = makeMatch([
    { id: "p1", board: identityBoard(), loadout: [skill(GHOST_CALL)] },
    { id: "p2", board: safeOpponentBoard(), loadout: [skill(NULLIFY)] },
  ]);
  state = useSkill(state, "p1", GHOST_CALL, {});
  state = respondToSkill(state, "p2", true);

  assert.equal(state.armed, undefined, "Ghost Call never got armed");

  state = callNumber(state, "p1", 4);
  assert.ok(state.calledNumbers.includes(4), "the call is public, not a ghost call");
  assert.deepEqual(playerIn(state, "p1").ghostNumbers, []);
});

// -- casual / no-skills parity -------------------------------------------

test("a player with an empty loadout (casual mode) cannot use any skill", () => {
  const state = createMatch([
    { id: "p1", board: identityBoard() },
    { id: "p2", board: safeOpponentBoard() },
  ]);
  assert.throws(() => useSkill(state, "p1", WILD_DAUB, { cellIndex: 0 }), /no available charge/);
  assert.throws(() => useSkill(state, "p1", DOUBLE_CALL, {}), /no available charge/);
  assert.throws(() => useSkill(state, "p1", GHOST_CALL, {}), /no available charge/);
  assert.throws(() => useSkill(state, "p1", CELL_SWAP, { a: 0, b: 1 }), /no available charge/);
});

test("with no skills used, callNumber behaves exactly as the pre-skill-system engine did", () => {
  let state = createMatch([
    { id: "p1", board: identityBoard() },
    { id: "p2", board: identityBoard() },
  ]);
  state = callNumber(state, "p1", 1);
  assert.equal(state.currentTurnIndex, 1);
  assert.equal(state.armed, undefined);
  assert.equal(state.skillUsedThisTurn, false);
  assert.equal(state.pendingSkill, undefined);
});

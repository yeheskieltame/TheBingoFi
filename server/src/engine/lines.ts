/**
 * Winning-line primitives. Pure, no I/O.
 *
 * A "line" is 5 board indices that all need to be marked for BINGO credit:
 * 5 rows + 5 columns + 2 diagonals = 12 lines total.
 */

import { type Board, BOARD_DIM, indexOf } from "./board.ts";

/** All 12 winning lines, each a tuple of 5 board indices (0-24). */
export const LINES: readonly (readonly number[])[] = buildLines();

function buildLines(): readonly (readonly number[])[] {
  const lines: number[][] = [];

  for (let row = 0; row < BOARD_DIM; row++) {
    const line: number[] = [];
    for (let col = 0; col < BOARD_DIM; col++) line.push(indexOf(row, col));
    lines.push(line);
  }

  for (let col = 0; col < BOARD_DIM; col++) {
    const line: number[] = [];
    for (let row = 0; row < BOARD_DIM; row++) line.push(indexOf(row, col));
    lines.push(line);
  }

  const diagonalMain: number[] = [];
  const diagonalAnti: number[] = [];
  for (let i = 0; i < BOARD_DIM; i++) {
    diagonalMain.push(indexOf(i, i));
    diagonalAnti.push(indexOf(i, BOARD_DIM - 1 - i));
  }
  lines.push(diagonalMain, diagonalAnti);

  return lines;
}

/**
 * Counts how many of the 12 lines are fully marked on `board`, i.e. every
 * number on that line is present in `calledSet`. calledSet is match-wide
 * (shared across all players), so this is the only place "marking" is
 * computed - there is no separate per-board marked-cell state to keep in
 * sync.
 *
 * This is the baseline (no-skills) rule. Once the skill system is in play,
 * a cell can also be marked via a player's own ghostNumbers (Ghost Call) or
 * daubedCells (Wild Daub) - see markedCellsFor / countCompletedLinesForPlayer
 * below, which generalize this. countCompletedLines itself is kept as-is
 * (not reimplemented in terms of the skill-aware helpers) since it's a
 * public API already relied on elsewhere (daily challenge, realtime views).
 */
export function countCompletedLines(board: Board, calledSet: ReadonlySet<number>): number {
  let completed = 0;
  for (const line of LINES) {
    let allMarked = true;
    for (const index of line) {
      if (!calledSet.has(board[index]!)) {
        allMarked = false;
        break;
      }
    }
    if (allMarked) completed++;
  }
  return completed;
}

/**
 * Per-player, skill-aware marking: cell at `index` is marked if its number
 * was called globally (`calledSet`), OR is one of this player's own
 * ghost-called numbers (`ghostSet`, Ghost Call - marked for this player
 * only), OR `index` itself was directly daubed (`daubedCells`, Wild Daub -
 * position-based, independent of the number sitting there). Returns one
 * boolean per board cell (index-aligned with `board`).
 */
export function markedCellsFor(
  board: Board,
  calledSet: ReadonlySet<number>,
  ghostSet: ReadonlySet<number>,
  daubedCells: readonly number[],
): readonly boolean[] {
  const daubedSet = new Set(daubedCells);
  return board.map((value, index) => calledSet.has(value) || ghostSet.has(value) || daubedSet.has(index));
}

/**
 * Skill-aware line count for one player: same as countCompletedLines but
 * marking comes from markedCellsFor (called + ghost + daubed) instead of
 * calledSet alone. When ghostSet and daubedCells are both empty this is
 * exactly countCompletedLines(board, calledSet).
 */
export function countCompletedLinesForPlayer(
  board: Board,
  calledSet: ReadonlySet<number>,
  ghostSet: ReadonlySet<number>,
  daubedCells: readonly number[],
): number {
  const marked = markedCellsFor(board, calledSet, ghostSet, daubedCells);
  let completed = 0;
  for (const line of LINES) {
    let allMarked = true;
    for (const index of line) {
      if (!marked[index]) {
        allMarked = false;
        break;
      }
    }
    if (allMarked) completed++;
  }
  return completed;
}

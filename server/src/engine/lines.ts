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

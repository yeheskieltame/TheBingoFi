/**
 * Board primitives. Pure, no I/O.
 *
 * A board is a 5x5 grid of the 25 numbers 1-25, each used exactly once,
 * stored as a flat row-major array (index = row * BOARD_DIM + col).
 * There is no "marked" state on the board itself: which cells are marked
 * is always derived by intersecting a board with the match's calledNumbers
 * (see lines.ts / match.ts). This keeps Board a pure, cheap-to-copy value.
 */

export const BOARD_DIM = 5;
export const BOARD_SIZE = BOARD_DIM * BOARD_DIM;
export const MIN_NUMBER = 1;
export const MAX_NUMBER = 25;

/** 25 numbers, index 0-24, row-major. Player-drafted, validated via validateBoard. */
export type Board = readonly number[];

export interface BoardValidationResult {
  readonly valid: boolean;
  readonly error?: string;
}

/**
 * Validates a candidate board: exactly BOARD_SIZE entries, each an integer
 * within [MIN_NUMBER, MAX_NUMBER], with no duplicates.
 *
 * This is a pure query, so it returns a result object instead of throwing -
 * callers that need "throw on invalid" semantics (e.g. createMatch) wrap
 * this and throw with their own context (which player, which match).
 */
export function validateBoard(numbers: readonly number[]): BoardValidationResult {
  if (numbers.length !== BOARD_SIZE) {
    return {
      valid: false,
      error: `Board must contain exactly ${BOARD_SIZE} numbers, got ${numbers.length}`,
    };
  }

  const seen = new Set<number>();
  for (const value of numbers) {
    if (!Number.isInteger(value) || value < MIN_NUMBER || value > MAX_NUMBER) {
      return {
        valid: false,
        error: `Board numbers must be integers between ${MIN_NUMBER} and ${MAX_NUMBER}, got ${value}`,
      };
    }
    if (seen.has(value)) {
      return { valid: false, error: `Board contains duplicate number ${value}` };
    }
    seen.add(value);
  }

  return { valid: true };
}

/** Row (0-4) for a given board index (0-24). */
export function rowOf(index: number): number {
  return Math.floor(index / BOARD_DIM);
}

/** Column (0-4) for a given board index (0-24). */
export function colOf(index: number): number {
  return index % BOARD_DIM;
}

/** Board index (0-24) for a given row/column (each 0-4). */
export function indexOf(row: number, col: number): number {
  return row * BOARD_DIM + col;
}

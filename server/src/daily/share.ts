/**
 * Wordle-style share card for a Daily Challenge result (CONCEPT.md §7.1): a
 * one-line headline plus a 5x5 emoji grid showing which cells were marked
 * by the time BINGO was reached. The board's actual numbers are never
 * included, so sharing a result doesn't spoil the puzzle for friends who
 * haven't played it yet.
 */

import { BOARD_DIM, indexOf } from "../engine/board.ts";
import type { ChallengeResult } from "./challenge.ts";

export type Locale = "id" | "en";

const MARKED = "🟩";
const UNMARKED = "⬜";

type Headline = Pick<ChallengeResult, "number" | "callsToBingo">;

const headline: Record<Locale, (result: Headline) => string> = {
  id: (r) => `TheBingoFi #${r.number} — 5 garis, call ke-${r.callsToBingo}`,
  en: (r) => `TheBingoFi #${r.number} — 5 lines in ${r.callsToBingo} calls`,
};

/**
 * Formats `result` (as returned by playChallenge) into a shareable text
 * block: the headline line, then 5 newline-joined rows of emoji grid.
 */
export function shareCard(
  result: Pick<ChallengeResult, "number" | "callsToBingo" | "markedAtBingo">,
  locale: Locale = "id",
): string {
  const lines = [headline[locale](result)];

  for (let row = 0; row < BOARD_DIM; row++) {
    let line = "";
    for (let col = 0; col < BOARD_DIM; col++) {
      line += result.markedAtBingo[indexOf(row, col)] ? MARKED : UNMARKED;
    }
    lines.push(line);
  }

  return lines.join("\n");
}

import { markedCellsFor } from "@thebingofi/server/engine";
import type { MatchView } from "@thebingofi/server/protocol";

import type { StoredBoard } from "@/lib/storage";

/**
 * Derives {numbers, marked} for the CALLER'S OWN board from a MatchView -
 * pure, so it's testable/reusable independent of the socket/transport. Used
 * by /play's page.tsx to persist "last board" (lib/storage.ts's
 * setStoredLastBoard) once a match finishes, which is what powers /plaza's
 * composer "lampirkan Board" option (CONCEPT.md §7.4b).
 *
 * `marked` holds actual NUMBERS (not cell indices) - matches the `board`
 * PlazaAttachment's wire shape (server/API.md's Plaza chat section) and is
 * unambiguous here because every board is a permutation of MIN_NUMBER..
 * MAX_NUMBER (no repeats), same assumption MatchBoard.tsx already makes via
 * markedCellsFor.
 *
 * Returns null when the view has no board yet - shouldn't happen for a
 * match that's actually been played through to "finished", but a missing
 * board is a real possibility we shouldn't crash on (e.g. spectating a
 * match this viewer never joined).
 */
export function boardAttachmentFrom(view: MatchView): StoredBoard | null {
  if (!view.board) return null;

  const calledSet = new Set(view.calledNumbers);
  const ghostSet = new Set(view.ghostNumbers ?? []);
  const marks = markedCellsFor(view.board, calledSet, ghostSet, view.daubedCells ?? []);
  const marked = view.board.filter((_, index) => marks[index]);

  return { numbers: view.board, marked };
}

/**
 * Gameplay events derived from engine state transitions. Pure, no I/O.
 *
 * The match engine (server/src/engine/match.ts) has no concept of quests,
 * XP, or social features - it only knows bingo rules. This module bridges
 * that gap by *deriving* a stream of domain events from consecutive
 * MatchState snapshots, without the engine ever needing to know quests
 * exist (see CLAUDE.md "Social & Live-Ops" / CONCEPT.md §7.2).
 */

import { type Board } from "../engine/board.ts";
import { LINES } from "../engine/lines.ts";
import type { MatchState } from "../engine/match.ts";

/** Discriminated union of every gameplay event the quest/social layer cares about. */
export type GameEvent =
  | { readonly type: "match_played"; readonly playerId: string }
  | { readonly type: "match_won"; readonly playerId: string }
  | {
      readonly type: "line_completed";
      readonly playerId: string;
      /** Indexes into engine LINES that newly became complete on this transition (0-4 rows, 5-9 cols, 10-11 diagonals). */
      readonly lineIndexes: readonly number[];
    }
  | { readonly type: "skill_used"; readonly playerId: string; readonly effectType: string }
  | { readonly type: "friend_invited"; readonly playerId: string };

/** Indexes (into LINES) of every line fully marked on `board` given `calledSet`. */
function completedLineIndexes(board: Board, calledSet: ReadonlySet<number>): number[] {
  const result: number[] = [];
  for (let i = 0; i < LINES.length; i++) {
    const line = LINES[i]!;
    if (line.every((index) => calledSet.has(board[index]!))) {
      result.push(i);
    }
  }
  return result;
}

/**
 * Derives the GameEvents produced by one callNumber transition (prev -> next).
 * Pure: never mutates either state, only reads.
 *
 * - Emits one "line_completed" per player who newly completed at least one
 *   line on this call (comparing the set of complete lines in prev vs next
 *   for that player's board), listing every newly-completed line index.
 *   A player with no newly-completed line gets no event.
 * - When the match transitions into "finished" on this call, emits
 *   "match_played" for every player plus "match_won" for next.winnerId.
 */
export function eventsFromCall(prev: MatchState, next: MatchState): GameEvent[] {
  const events: GameEvent[] = [];

  const prevCalledSet = new Set(prev.calledNumbers);
  const nextCalledSet = new Set(next.calledNumbers);

  for (const player of next.players) {
    const prevLines = new Set(completedLineIndexes(player.board, prevCalledSet));
    const newLines = completedLineIndexes(player.board, nextCalledSet).filter(
      (index) => !prevLines.has(index),
    );
    if (newLines.length > 0) {
      events.push({ type: "line_completed", playerId: player.id, lineIndexes: newLines });
    }
  }

  if (prev.status !== "finished" && next.status === "finished") {
    for (const player of next.players) {
      events.push({ type: "match_played", playerId: player.id });
    }
    if (next.winnerId !== undefined) {
      events.push({ type: "match_won", playerId: next.winnerId });
    }
  }

  return events;
}

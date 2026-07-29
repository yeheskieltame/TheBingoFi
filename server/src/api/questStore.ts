/**
 * Shared quest-progress store, in-memory, keyed by playerId. Both the
 * realtime layer (../realtime/server.ts, which records progress as match
 * events happen during a game) and the HTTP API (../api/http.ts, GET
 * /quests/progress/:playerId) read/write through this ONE module, so
 * there's a single source of truth instead of two stores that can drift
 * apart.
 *
 * // ponytail: in-memory, resets on restart - swap for real persistence
 * once that's needed (same caveat as realtime/rooms.ts).
 */

import { applyEvent, exampleQuests, type ApplyEventResult, type GameEvent, type QuestProgress } from "../quest/index.ts";

const progressByPlayer = new Map<string, QuestProgress[]>();

/** A player's current quest progress across every window (daily/weekly/season). */
export function getProgress(playerId: string): QuestProgress[] {
  return progressByPlayer.get(playerId) ?? [];
}

/**
 * Folds one GameEvent into the shared store for `event.playerId`, using
 * `dateISO` to resolve which daily/weekly/season period it belongs to (see
 * quest/quest.ts's periodKeyFor). Returns the same shape as quest.ts's
 * applyEvent, including the quests newly completed by this event.
 */
export function recordEvent(event: GameEvent, dateISO: string): ApplyEventResult {
  const progress = getProgress(event.playerId);
  const result = applyEvent(exampleQuests, progress, event, { dateISO });
  progressByPlayer.set(event.playerId, result.progress);
  return result;
}

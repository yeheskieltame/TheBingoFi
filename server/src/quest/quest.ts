/**
 * Data-driven quest engine. Pure, no I/O.
 *
 * Quests are DATA (QuestDef), never hardcoded into engine or transport code
 * (CLAUDE.md "Social & Live-Ops", CONCEPT.md §7.2). This module only knows
 * how to evaluate a GameEvent (see events.ts) against a list of QuestDef and
 * fold it into QuestProgress - it has no idea what a match, a board, or a
 * skill actually is beyond the event shape.
 */

import type { GameEvent } from "./events.ts";

export type QuestWindow = "daily" | "weekly" | "season";

/**
 * Optional, data-driven event narrowing beyond eventType. Every provided
 * key must match for the quest to count the event:
 *  - effectType: only relevant to "skill_used" events, matches exact effectType.
 *  - anyLineIndexIn: only relevant to "line_completed" events, matches when
 *    the event's lineIndexes intersects this set (e.g. [10, 11] for "any diagonal").
 */
export interface QuestFilter {
  readonly effectType?: string;
  readonly anyLineIndexIn?: readonly number[];
}

export interface QuestReward {
  readonly xp: number;
  readonly seasonPoints: number;
  readonly cosmeticId?: string;
}

export interface QuestDef {
  readonly id: string;
  readonly title: string;
  readonly eventType: GameEvent["type"];
  /** Number of matching events required to complete the quest. */
  readonly target: number;
  readonly window: QuestWindow;
  readonly reward: QuestReward;
  readonly filter?: QuestFilter;
}

export interface QuestProgress {
  readonly questId: string;
  readonly playerId: string;
  /** Identifies the active daily/weekly/season period this progress belongs to - see periodKeyFor. */
  readonly periodKey: string;
  readonly count: number;
  readonly completed: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * ISO 8601 week key (e.g. "2026-W01") for the week containing dateISO.
 * Standard ISO week algorithm: weeks start Monday, week 1 is the week
 * containing the year's first Thursday.
 */
function isoWeekKey(dateISO: string): string {
  const date = new Date(`${dateISO}T00:00:00Z`);
  const target = new Date(date.getTime());
  const mondayBasedDay = (date.getUTCDay() + 6) % 7; // Mon=0 ... Sun=6
  target.setUTCDate(target.getUTCDate() - mondayBasedDay + 3); // Thursday of this ISO week

  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const firstThursdayMondayBasedDay = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstThursdayMondayBasedDay + 3);

  const weekNumber = 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * DAY_MS));
  return `${target.getUTCFullYear()}-W${String(weekNumber).padStart(2, "0")}`;
}

/**
 * The period key a quest window is currently in, given "now" as dateISO
 * (YYYY-MM-DD): daily -> dateISO itself, weekly -> ISO week ("YYYY-Wnn"),
 * season -> seasonId (defaults to "S1"). Two events with different period
 * keys for the same quest/player never share progress - that IS the reset.
 */
export function periodKeyFor(window: QuestWindow, dateISO: string, seasonId = "S1"): string {
  switch (window) {
    case "daily":
      return dateISO;
    case "weekly":
      return isoWeekKey(dateISO);
    case "season":
      return seasonId;
  }
}

function eventMatchesFilter(event: GameEvent, filter: QuestFilter | undefined): boolean {
  if (filter === undefined) return true;

  if (filter.effectType !== undefined) {
    if (event.type !== "skill_used" || event.effectType !== filter.effectType) return false;
  }

  if (filter.anyLineIndexIn !== undefined) {
    if (event.type !== "line_completed") return false;
    const overlaps = event.lineIndexes.some((index) => filter.anyLineIndexIn!.includes(index));
    if (!overlaps) return false;
  }

  return true;
}

export interface ApplyEventContext {
  readonly dateISO: string;
  readonly seasonId?: string;
}

export interface ApplyEventResult {
  readonly progress: QuestProgress[];
  /** Quests that transitioned from not-completed to completed on this event (never repeated). */
  readonly completed: QuestDef[];
}

/**
 * Folds one GameEvent into quest progress. Pure and immutable: always
 * returns a brand new progress array, never mutates the input.
 *
 * For every QuestDef whose eventType and filter match the event: finds (or
 * creates) that player's QuestProgress for the quest's *current* period
 * (per periodKeyFor + ctx), increments its count, and flags it completed
 * the moment count reaches target. A quest already marked completed is
 * only ever reported in the returned `completed` list on the event that
 * first crosses the target - never again afterwards.
 */
export function applyEvent(
  defs: readonly QuestDef[],
  progress: readonly QuestProgress[],
  event: GameEvent,
  ctx: ApplyEventContext,
): ApplyEventResult {
  let nextProgress = progress.slice();
  const completed: QuestDef[] = [];

  for (const def of defs) {
    if (def.eventType !== event.type) continue;
    if (!eventMatchesFilter(event, def.filter)) continue;

    const periodKey = periodKeyFor(def.window, ctx.dateISO, ctx.seasonId);
    const index = nextProgress.findIndex(
      (entry) =>
        entry.questId === def.id && entry.playerId === event.playerId && entry.periodKey === periodKey,
    );

    if (index === -1) {
      const count = 1;
      const isNowCompleted = count >= def.target;
      const entry: QuestProgress = {
        questId: def.id,
        playerId: event.playerId,
        periodKey,
        count,
        completed: isNowCompleted,
      };
      nextProgress = [...nextProgress, entry];
      if (isNowCompleted) completed.push(def);
    } else {
      const existing = nextProgress[index]!;
      const wasCompleted = existing.completed;
      const count = existing.count + 1;
      const isNowCompleted = wasCompleted || count >= def.target;
      const updated: QuestProgress = { ...existing, count, completed: isNowCompleted };
      nextProgress = [...nextProgress.slice(0, index), updated, ...nextProgress.slice(index + 1)];
      if (!wasCompleted && isNowCompleted) completed.push(def);
    }
  }

  return { progress: nextProgress, completed };
}

/**
 * 5 starter quests straight from CONCEPT.md §7.2 - daily quest list ("main
 * 3 match", "menang 1x", "selesaikan garis diagonal") plus two weekly
 * quests ("menang 10 match", "undang 1 teman"). Real content lives in a
 * catalog/DB later; this is the reference shape + something to test against.
 */
export const exampleQuests: readonly QuestDef[] = [
  {
    id: "daily_play_3_matches",
    title: "Main 3 match",
    eventType: "match_played",
    target: 3,
    window: "daily",
    reward: { xp: 50, seasonPoints: 10 },
  },
  {
    id: "daily_win_1_match",
    title: "Menang 1x",
    eventType: "match_won",
    target: 1,
    window: "daily",
    reward: { xp: 100, seasonPoints: 20 },
  },
  {
    id: "daily_complete_diagonal",
    title: "Selesaikan garis diagonal",
    eventType: "line_completed",
    target: 1,
    window: "daily",
    reward: { xp: 30, seasonPoints: 5 },
    filter: { anyLineIndexIn: [10, 11] },
  },
  {
    id: "weekly_win_10_matches",
    title: "Menang 10 match",
    eventType: "match_won",
    target: 10,
    window: "weekly",
    reward: { xp: 500, seasonPoints: 100, cosmeticId: "frame_weekly_champion" },
  },
  {
    id: "weekly_invite_1_friend",
    title: "Undang 1 teman",
    eventType: "friend_invited",
    target: 1,
    window: "weekly",
    reward: { xp: 80, seasonPoints: 15 },
  },
];

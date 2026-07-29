import { test } from "node:test";
import assert from "node:assert/strict";
import type { GameEvent } from "./events.ts";
import { applyEvent, exampleQuests, periodKeyFor, type QuestDef, type QuestProgress } from "./quest.ts";

const matchPlayedQuest: QuestDef = {
  id: "q_play_3",
  title: "Main 3 match",
  eventType: "match_played",
  target: 3,
  window: "daily",
  reward: { xp: 50, seasonPoints: 10 },
};

const diagonalQuest: QuestDef = {
  id: "q_diagonal",
  title: "Selesaikan garis diagonal",
  eventType: "line_completed",
  target: 1,
  window: "daily",
  reward: { xp: 30, seasonPoints: 5 },
  filter: { anyLineIndexIn: [10, 11] },
};

function matchPlayed(playerId: string): GameEvent {
  return { type: "match_played", playerId };
}

function lineCompleted(playerId: string, lineIndexes: number[]): GameEvent {
  return { type: "line_completed", playerId, lineIndexes };
}

test("applyEvent increases count on each matching event and reports completion exactly once", () => {
  const ctx = { dateISO: "2026-07-29" };
  let progress: QuestProgress[] = [];

  const r1 = applyEvent([matchPlayedQuest], progress, matchPlayed("p1"), ctx);
  progress = r1.progress;
  assert.equal(progress[0]!.count, 1);
  assert.equal(progress[0]!.completed, false);
  assert.deepEqual(r1.completed, []);

  const r2 = applyEvent([matchPlayedQuest], progress, matchPlayed("p1"), ctx);
  progress = r2.progress;
  assert.equal(progress[0]!.count, 2);
  assert.equal(progress[0]!.completed, false);
  assert.deepEqual(r2.completed, []);

  const r3 = applyEvent([matchPlayedQuest], progress, matchPlayed("p1"), ctx);
  progress = r3.progress;
  assert.equal(progress[0]!.count, 3);
  assert.equal(progress[0]!.completed, true);
  assert.deepEqual(r3.completed, [matchPlayedQuest], "quest completes on the event that reaches target");

  // 4th matching event: count keeps moving, but the quest must not be
  // reported as newly-completed a second time.
  const r4 = applyEvent([matchPlayedQuest], progress, matchPlayed("p1"), ctx);
  progress = r4.progress;
  assert.equal(progress[0]!.count, 4);
  assert.equal(progress[0]!.completed, true);
  assert.deepEqual(r4.completed, [], "already-completed quest is not reported again");

  assert.equal(progress.length, 1, "still a single progress entry for this player/period");
});

test("applyEvent is pure and immutable: it never mutates the progress array or entries it was given", () => {
  const ctx = { dateISO: "2026-07-29" };
  const before: QuestProgress[] = [];
  const result = applyEvent([matchPlayedQuest], before, matchPlayed("p1"), ctx);

  assert.deepEqual(before, [], "input array untouched");
  assert.notEqual(result.progress, before, "a new array is returned");
});

test("applyEvent filter: line_completed with a non-diagonal index does not match, a diagonal index does", () => {
  const ctx = { dateISO: "2026-07-29" };

  const missResult = applyEvent([diagonalQuest], [], lineCompleted("p1", [0]), ctx);
  assert.deepEqual(missResult.progress, [], "row line does not satisfy anyLineIndexIn:[10,11]");
  assert.deepEqual(missResult.completed, []);

  const hitResult = applyEvent([diagonalQuest], [], lineCompleted("p1", [10]), ctx);
  assert.equal(hitResult.progress.length, 1);
  assert.equal(hitResult.progress[0]!.count, 1);
  assert.equal(hitResult.progress[0]!.completed, true, "target is 1, so a single matching event completes it");
  assert.deepEqual(hitResult.completed, [diagonalQuest]);

  // A line_completed carrying several indexes, only one of which overlaps
  // the filter, still counts as a single match.
  const partialOverlap = applyEvent([diagonalQuest], [], lineCompleted("p1", [0, 11]), ctx);
  assert.equal(partialOverlap.progress[0]!.count, 1);
});

test("applyEvent: different periodKey (e.g. a new day for a daily quest) starts fresh progress, old progress untouched", () => {
  const day1 = { dateISO: "2026-07-28" };
  const day2 = { dateISO: "2026-07-29" };

  const afterDay1 = applyEvent([matchPlayedQuest], [], matchPlayed("p1"), day1);
  const afterDay1Twice = applyEvent([matchPlayedQuest], afterDay1.progress, matchPlayed("p1"), day1);
  assert.equal(afterDay1Twice.progress.length, 1);
  assert.equal(afterDay1Twice.progress[0]!.count, 2);
  assert.equal(afterDay1Twice.progress[0]!.periodKey, "2026-07-28");

  const afterDay2 = applyEvent([matchPlayedQuest], afterDay1Twice.progress, matchPlayed("p1"), day2);
  assert.equal(afterDay2.progress.length, 2, "a new period gets its own progress entry");

  const day1Entry = afterDay2.progress.find((p) => p.periodKey === "2026-07-28")!;
  const day2Entry = afterDay2.progress.find((p) => p.periodKey === "2026-07-29")!;
  assert.equal(day1Entry.count, 2, "old period's progress is left exactly as it was");
  assert.equal(day2Entry.count, 1, "new period starts counting from zero");
});

test("periodKeyFor: daily is the date itself, season is the seasonId, weekly is an ISO week key", () => {
  assert.equal(periodKeyFor("daily", "2026-07-29"), "2026-07-29");
  assert.equal(periodKeyFor("season", "2026-07-29"), "S1", "defaults to S1");
  assert.equal(periodKeyFor("season", "2026-07-29", "S2"), "S2");

  // 2026-01-01 is a Thursday, so it falls in ISO week 1 of 2026 (the week
  // containing the year's first Thursday is always week 1).
  assert.equal(periodKeyFor("weekly", "2026-01-01"), "2026-W01");
  // The following Monday starts ISO week 2.
  assert.equal(periodKeyFor("weekly", "2026-01-05"), "2026-W02");
  // 2025-12-29 is a Monday whose ISO week belongs to 2026 (year rollover).
  assert.equal(periodKeyFor("weekly", "2025-12-29"), "2026-W01");
});

test("applyEvent keeps each player's progress on the same quest fully independent", () => {
  const ctx = { dateISO: "2026-07-29" };
  let progress: QuestProgress[] = [];

  progress = applyEvent([matchPlayedQuest], progress, matchPlayed("p1"), ctx).progress;
  progress = applyEvent([matchPlayedQuest], progress, matchPlayed("p1"), ctx).progress;
  progress = applyEvent([matchPlayedQuest], progress, matchPlayed("p2"), ctx).progress;

  assert.equal(progress.length, 2);
  const p1Entry = progress.find((p) => p.playerId === "p1")!;
  const p2Entry = progress.find((p) => p.playerId === "p2")!;
  assert.equal(p1Entry.count, 2);
  assert.equal(p1Entry.completed, false);
  assert.equal(p2Entry.count, 1);
  assert.equal(p2Entry.completed, false);
});

test("applyEvent ignores events whose eventType does not match any quest def", () => {
  const ctx = { dateISO: "2026-07-29" };
  const result = applyEvent([matchPlayedQuest], [], { type: "friend_invited", playerId: "p1" }, ctx);
  assert.deepEqual(result.progress, []);
  assert.deepEqual(result.completed, []);
});

test("exampleQuests contains the 5 quests described in CONCEPT.md §7.2", () => {
  assert.equal(exampleQuests.length, 5);

  const byId = new Map(exampleQuests.map((q) => [q.id, q]));
  assert.equal(byId.size, 5, "every quest id is unique");

  const dailyPlay = [...exampleQuests].find((q) => q.eventType === "match_played" && q.window === "daily");
  assert.ok(dailyPlay);
  assert.equal(dailyPlay!.target, 3);

  const dailyWin = [...exampleQuests].find(
    (q) => q.eventType === "match_won" && q.window === "daily",
  );
  assert.ok(dailyWin);
  assert.equal(dailyWin!.target, 1);

  const dailyDiagonal = [...exampleQuests].find(
    (q) => q.eventType === "line_completed" && q.window === "daily",
  );
  assert.ok(dailyDiagonal);
  assert.deepEqual(dailyDiagonal!.filter?.anyLineIndexIn, [10, 11]);

  const weeklyWin = [...exampleQuests].find(
    (q) => q.eventType === "match_won" && q.window === "weekly",
  );
  assert.ok(weeklyWin);
  assert.equal(weeklyWin!.target, 10);

  const weeklyInvite = [...exampleQuests].find(
    (q) => q.eventType === "friend_invited" && q.window === "weekly",
  );
  assert.ok(weeklyInvite);
  assert.equal(weeklyInvite!.target, 1);

  // Reward is never money/tokens (CLAUDE.md core rule) - just structural sanity.
  for (const quest of exampleQuests) {
    assert.equal(typeof quest.reward.xp, "number");
    assert.equal(typeof quest.reward.seasonPoints, "number");
  }
});

/**
 * Daily Challenge leaderboard: best score per player, per calendar day.
 * Written to by POST /daily/play, read by GET /daily/leaderboard (see
 * ./http.ts).
 *
 * Two backends behind one interface (LeaderboardStore), chosen
 * automatically by db/pool.ts's `pool` presence:
 *  - in-memory: EXACTLY the previous behavior - deduped by `nickname`,
 *    resets on restart. Kept unchanged on purpose so every existing test
 *    (which never passes `accountId`) keeps passing without Postgres.
 *  - Postgres: deduped by (date, player_id) per db/schema.sql's
 *    `daily_scores` - a stable account (../identity/identity.ts), not a
 *    free-text nickname, is the identity. A submission with no `accountId`
 *    (anonymous HTTP play - POST /daily/play doesn't require one, see
 *    server/API.md) gets a fresh random id each time, so it's never deduped
 *    against itself in this mode. That's an accepted consequence of "guest
 *    tanpa identity tetap boleh main, pakai accountId anonim" (this task's
 *    spec), not a bug - nickname is purely a display label once an account
 *    is involved, so the same nickname CAN legitimately appear more than
 *    once if it comes from different accounts.
 *
 * // ponytail: the in-memory path still resets on restart - same caveat as
 * realtime/rooms.ts. Only the Postgres path actually persists.
 */
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";

import { pool as defaultPool } from "../db/pool.ts";

export interface LeaderboardEntry {
  readonly nickname: string;
  readonly score: number;
  readonly callsToBingo: number;
}

/** What POST /daily/play hands the store - `accountId` is optional, see server/API.md's "Identity" section. */
export interface LeaderboardSubmission extends LeaderboardEntry {
  readonly accountId?: string;
}

export interface LeaderboardStore {
  submitScore(dateISO: string, entry: LeaderboardSubmission): Promise<void>;
  getLeaderboard(dateISO: string): Promise<LeaderboardEntry[]>;
}

const MAX_LEADERBOARD_SIZE = 50;

function createInMemoryLeaderboardStore(): LeaderboardStore {
  const entriesByDate = new Map<string, Map<string, LeaderboardEntry>>();

  return {
    async submitScore(dateISO, entry) {
      let dayEntries = entriesByDate.get(dateISO);
      if (!dayEntries) {
        dayEntries = new Map();
        entriesByDate.set(dateISO, dayEntries);
      }

      const existing = dayEntries.get(entry.nickname);
      if (!existing || entry.score > existing.score) {
        dayEntries.set(entry.nickname, { nickname: entry.nickname, score: entry.score, callsToBingo: entry.callsToBingo });
      }
    },

    async getLeaderboard(dateISO) {
      const dayEntries = entriesByDate.get(dateISO);
      if (!dayEntries) return [];

      return Array.from(dayEntries.values())
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_LEADERBOARD_SIZE);
    },
  };
}

interface DailyScoreRow {
  readonly nickname: string;
  readonly score: number;
  readonly calls_to_bingo: number;
}

function createPostgresLeaderboardStore(pg: Pool): LeaderboardStore {
  return {
    async submitScore(dateISO, entry) {
      // No accountId (anonymous HTTP play) -> a fresh id per submission, so
      // it's never deduped against itself - see this module's doc.
      const playerId = entry.accountId ?? randomUUID();
      await pg.query(
        `INSERT INTO daily_scores (date, player_id, nickname, score, calls_to_bingo)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (date, player_id) DO UPDATE
           SET nickname = EXCLUDED.nickname, score = EXCLUDED.score, calls_to_bingo = EXCLUDED.calls_to_bingo
           WHERE daily_scores.score < EXCLUDED.score`,
        [dateISO, playerId, entry.nickname, entry.score, entry.callsToBingo],
      );
    },

    async getLeaderboard(dateISO) {
      const result = await pg.query<DailyScoreRow>(
        `SELECT nickname, score, calls_to_bingo FROM daily_scores WHERE date = $1 ORDER BY score DESC LIMIT $2`,
        [dateISO, MAX_LEADERBOARD_SIZE],
      );
      return result.rows.map((row) => ({ nickname: row.nickname, score: row.score, callsToBingo: row.calls_to_bingo }));
    },
  };
}

/** Picks the Postgres-backed store when `pg` (default: db/pool.ts's module-level pool) is set, else the in-memory one. */
export function createLeaderboardStore(pg: Pool | undefined = defaultPool): LeaderboardStore {
  return pg ? createPostgresLeaderboardStore(pg) : createInMemoryLeaderboardStore();
}

const store = createLeaderboardStore();

/** Records `entry` for `dateISO`, keeping only the best score per identity - see LeaderboardStore's doc for what "identity" means per backend. */
export function submitScore(dateISO: string, entry: LeaderboardSubmission): Promise<void> {
  return store.submitScore(dateISO, entry);
}

/** Top MAX_LEADERBOARD_SIZE entries for `dateISO`, sorted by score descending. */
export function getLeaderboard(dateISO: string): Promise<LeaderboardEntry[]> {
  return store.getLeaderboard(dateISO);
}

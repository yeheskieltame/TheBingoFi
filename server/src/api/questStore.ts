/**
 * Shared quest-progress store. Both the realtime layer (../realtime/server.ts,
 * which records progress as match events happen during a game) and the HTTP
 * API (../api/http.ts, GET /quests/progress/:playerId) read/write through
 * this ONE module, so there's a single source of truth instead of two
 * stores that can drift apart.
 *
 * `playerId` here is the STABLE accountId from ../identity/identity.ts, not
 * the ephemeral per-room seat id realtime/rooms.ts hands out on every
 * room:create/join - see server/API.md's "Identity" section for why (the
 * old behavior, keying on the ephemeral id, reset quest progress on every
 * match). realtime/server.ts is responsible for mapping a MatchState's
 * ephemeral player ids to accountId before calling recordEvent - this
 * module has no idea rooms/matches exist at all, only GameEvent.playerId.
 *
 * Two backends behind one interface (QuestStore), chosen automatically by
 * db/pool.ts's `pool` presence - see api/dailyLeaderboard.ts's doc for the
 * same pattern:
 *  - in-memory: EXACTLY the previous behavior (a plain Map), so every
 *    existing test keeps passing without Postgres.
 *  - Postgres: `quest_progress`, keyed (player_id, quest_id, period_key)
 *    per db/schema.sql. Reuses quest/quest.ts's pure `applyEvent` exactly
 *    like the in-memory path (load this player's progress, fold the event
 *    in memory, upsert the result) rather than reimplementing the
 *    increment/completion logic in SQL - one source of truth for what
 *    "quest progress" even means.
 *
 * // ponytail: in-memory backend resets on restart - same caveat as
 * realtime/rooms.ts. Only the Postgres backend actually persists.
 */
import type { Pool } from "pg";

import { pool as defaultPool } from "../db/pool.ts";
import { applyEvent, exampleQuests, type ApplyEventResult, type GameEvent, type QuestProgress } from "../quest/index.ts";

export interface QuestStore {
  /** A player's current quest progress across every window (daily/weekly/season). */
  getProgress(playerId: string): Promise<QuestProgress[]>;
  /**
   * Folds one GameEvent into the store for `event.playerId`, using
   * `dateISO` to resolve which daily/weekly/season period it belongs to
   * (see quest/quest.ts's periodKeyFor). Returns the same shape as
   * quest.ts's applyEvent, including the quests newly completed by this
   * event.
   */
  recordEvent(event: GameEvent, dateISO: string): Promise<ApplyEventResult>;
}

function createInMemoryQuestStore(): QuestStore {
  const progressByPlayer = new Map<string, QuestProgress[]>();

  return {
    async getProgress(playerId) {
      return progressByPlayer.get(playerId) ?? [];
    },

    async recordEvent(event, dateISO) {
      const progress = progressByPlayer.get(event.playerId) ?? [];
      const result = applyEvent(exampleQuests, progress, event, { dateISO });
      progressByPlayer.set(event.playerId, result.progress);
      return result;
    },
  };
}

interface QuestProgressRow {
  readonly quest_id: string;
  readonly player_id: string;
  readonly period_key: string;
  readonly count: number;
  readonly completed: boolean;
}

function rowToProgress(row: QuestProgressRow): QuestProgress {
  return { questId: row.quest_id, playerId: row.player_id, periodKey: row.period_key, count: row.count, completed: row.completed };
}

function createPostgresQuestStore(pg: Pool): QuestStore {
  async function loadProgress(playerId: string): Promise<QuestProgress[]> {
    const result = await pg.query<QuestProgressRow>(
      `SELECT quest_id, player_id, period_key, count, completed FROM quest_progress WHERE player_id = $1`,
      [playerId],
    );
    return result.rows.map(rowToProgress);
  }

  return {
    getProgress: loadProgress,

    async recordEvent(event, dateISO) {
      const progress = await loadProgress(event.playerId);
      const result = applyEvent(exampleQuests, progress, event, { dateISO });

      for (const entry of result.progress) {
        await pg.query(
          `INSERT INTO quest_progress (player_id, quest_id, period_key, count, completed)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (player_id, quest_id, period_key)
           DO UPDATE SET count = EXCLUDED.count, completed = EXCLUDED.completed`,
          [entry.playerId, entry.questId, entry.periodKey, entry.count, entry.completed],
        );
      }

      return result;
    },
  };
}

/** Picks the Postgres-backed store when `pg` (default: db/pool.ts's module-level pool) is set, else the in-memory one. */
export function createQuestStore(pg: Pool | undefined = defaultPool): QuestStore {
  return pg ? createPostgresQuestStore(pg) : createInMemoryQuestStore();
}

const store = createQuestStore();

export function getProgress(playerId: string): Promise<QuestProgress[]> {
  return store.getProgress(playerId);
}

export function recordEvent(event: GameEvent, dateISO: string): Promise<ApplyEventResult> {
  return store.recordEvent(event, dateISO);
}

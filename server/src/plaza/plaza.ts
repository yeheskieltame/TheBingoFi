/**
 * Plaza chat: validation/rate-limiting logic behind the global (not
 * per-room) social chat channel - CONCEPT.md §7.4b "Plaza — Ruang Sosial &
 * Showcase". Kept separate from realtime/server.ts's socket wiring so it
 * can be unit tested without a socket at all (see plaza.test.ts) -
 * server.ts only forwards raw payloads in and broadcasts whatever comes
 * back out.
 *
 * A message may optionally carry `skillId` - CONCEPT.md §7.4b: "pesan chat
 * bisa melampirkan kartu skill yang dimiliki (render sebagai kartu, bukan
 * teks)". This module never checks ownership of that skillId (that's a
 * chain/reader.ts concern, and Plaza works for guests too) - it only
 * shape-validates it as a plausible token id.
 *
 * Two backends behind one interface (PlazaStore), chosen automatically by
 * db/pool.ts's `pool` presence - same pattern as api/questStore.ts and
 * api/dailyLeaderboard.ts:
 *  - in-memory: EXACTLY the previous behavior - a ring buffer capped at
 *    PLAZA_HISTORY_LIMIT, resets on restart.
 *  - Postgres: `plaza_messages` (db/schema.sql), history read back as the
 *    PLAZA_HISTORY_LIMIT most recent rows, oldest -> newest.
 *
 * Rate limiting ALWAYS stays in-memory (a plain Map, per socket id)
 * regardless of backend - it's a transport/abuse concern scoped to this
 * process's live connections, not something that needs to survive a
 * restart or be shared across server instances, so persisting it would be
 * pure overhead.
 *
 * `accountId` (../identity/identity.ts) is attached to a persisted message
 * ONLY when the socket already established one (see realtime/server.ts) -
 * Plaza never forces identity creation just to send a chat message (CLAUDE.md:
 * "guest play tanpa wallet harus bisa"), so plaza_messages.player_id is
 * nullable and often NULL for pure guests.
 *
 * // ponytail: the in-memory backend's ring buffer resets on restart, no
 * persistence and no report/mute moderation yet - CONCEPT.md §7.4b:
 * "Moderasi: rate limit + panjang pesan dulu; report/mute menyusul."
 */

import { randomUUID } from "node:crypto";
import type { Pool } from "pg";

import { pool as defaultPool } from "../db/pool.ts";

/** Max messages kept/returned as history. */
export const PLAZA_HISTORY_LIMIT = 100;
/** Minimum time between two messages from the same socket. */
export const PLAZA_RATE_LIMIT_MS = 2000;

const MAX_NICKNAME_LENGTH = 24;
const MAX_TEXT_LENGTH = 280;

export interface PlazaMessage {
  readonly id: string;
  readonly nickname: string;
  readonly text: string;
  /** Skill token id the sender is showing off, if any - see CONCEPT.md §7.4b. */
  readonly skillId?: number;
  readonly at: number;
}

export interface PlazaStore {
  /**
   * Validates + appends a message from `socketId`, enforcing
   * PLAZA_RATE_LIMIT_MS between two messages from the same socket. Rejects
   * (never throws synchronously) with a descriptive Error on any violation
   * (bad shape, too short/long, rate limited) - callers (see
   * realtime/server.ts's safeHandler) turn that into an ack error rather
   * than a crash. A rejected call never updates the rate-limit clock, so a
   * bad payload can't lock a socket out of its own next (valid) attempt.
   * `now` defaults to Date.now(), overridable for tests. `accountId`, if
   * the caller's socket already has one, is persisted alongside the
   * message (see this module's doc) but never appears in the returned
   * PlazaMessage itself.
   */
  addMessage(socketId: string, input: unknown, now?: number, accountId?: string): Promise<PlazaMessage>;
  /** Buffer contents, oldest -> newest (at most PLAZA_HISTORY_LIMIT). */
  getHistory(): Promise<PlazaMessage[]>;
}

function validateNickname(value: unknown): string {
  if (typeof value !== "string") throw new Error("nickname must be a string");
  const trimmed = value.trim();
  if (trimmed.length < 1 || trimmed.length > MAX_NICKNAME_LENGTH) {
    throw new Error(`nickname must be 1-${MAX_NICKNAME_LENGTH} characters`);
  }
  return trimmed;
}

function validateText(value: unknown): string {
  if (typeof value !== "string") throw new Error("text must be a string");
  const trimmed = value.trim();
  if (trimmed.length < 1 || trimmed.length > MAX_TEXT_LENGTH) {
    throw new Error(`text must be 1-${MAX_TEXT_LENGTH} characters`);
  }
  return trimmed;
}

function validateSkillId(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new Error("skillId must be a positive integer");
  }
  return value;
}

// -- storage backends -----------------------------------------------------
//
// Deliberately separate from rate limiting (createPlazaStore below owns
// that, always in-memory) - a backend only ever needs to insert one message
// and answer "what's the history", nothing about sockets/timing.

interface PlazaBackend {
  insert(message: PlazaMessage, accountId: string | undefined): Promise<void>;
  getHistory(): Promise<PlazaMessage[]>;
}

function createInMemoryBackend(): PlazaBackend {
  const history: PlazaMessage[] = [];

  return {
    async insert(message) {
      history.push(message);
      if (history.length > PLAZA_HISTORY_LIMIT) history.shift();
    },

    async getHistory() {
      return history.slice();
    },
  };
}

interface PlazaMessageRow {
  readonly id: string;
  readonly nickname: string;
  readonly text: string;
  readonly skill_id: number | null;
  readonly created_at: Date;
}

function createPostgresBackend(pg: Pool): PlazaBackend {
  return {
    async insert(message, accountId) {
      await pg.query(
        `INSERT INTO plaza_messages (id, player_id, nickname, text, skill_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [message.id, accountId ?? null, message.nickname, message.text, message.skillId ?? null, new Date(message.at)],
      );
    },

    async getHistory() {
      const result = await pg.query<PlazaMessageRow>(
        `SELECT id, nickname, text, skill_id, created_at FROM plaza_messages ORDER BY created_at DESC LIMIT $1`,
        [PLAZA_HISTORY_LIMIT],
      );
      return result.rows
        .map((row) => ({
          id: row.id,
          nickname: row.nickname,
          text: row.text,
          skillId: row.skill_id ?? undefined,
          at: row.created_at.getTime(),
        }))
        .reverse(); // DESC (most-recent-first query) -> ASC (oldest -> newest, matching the in-memory backend's order).
    },
  };
}

/**
 * Builds a fresh, independent Plaza store - one per realtime server (see
 * realtime/server.ts), deliberately never a module-level singleton so
 * separate server instances (e.g. one per test) never bleed
 * rate-limit/socket state into each other, even though the storage backend
 * itself may be shared (Postgres) - see this module's doc.
 */
export function createPlazaStore(pg: Pool | undefined = defaultPool): PlazaStore {
  const backend = pg ? createPostgresBackend(pg) : createInMemoryBackend();
  const lastSentAt = new Map<string, number>();

  return {
    async addMessage(socketId, input, now = Date.now(), accountId) {
      const last = lastSentAt.get(socketId);
      if (last !== undefined && now - last < PLAZA_RATE_LIMIT_MS) {
        throw new Error(`Rate limited - tunggu ${PLAZA_RATE_LIMIT_MS - (now - last)}ms lagi sebelum kirim pesan lagi`);
      }

      const raw = (input ?? {}) as Record<string, unknown>;
      const nickname = validateNickname(raw.nickname);
      const text = validateText(raw.text);
      const skillId = validateSkillId(raw.skillId);

      const message: PlazaMessage = { id: randomUUID(), nickname, text, skillId, at: now };
      lastSentAt.set(socketId, now);
      await backend.insert(message, accountId);
      return message;
    },

    getHistory() {
      return backend.getHistory();
    },
  };
}

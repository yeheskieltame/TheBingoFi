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
 * A message may ALSO optionally carry a structured `attachment` - the
 * richer successor to bare `skillId`, letting a message show off a skill
 * card, a match result card, or a board snapshot (see `PlazaAttachment`
 * below). This is still chat input from an untrusted client, so every kind
 * is validated strictly (see validateAttachment) and NEVER partially
 * persisted - a rejected attachment fails the whole message. `skillId`
 * stays fully supported for backward compatibility: it's still accepted
 * and stored exactly as before, and on every read path (getHistory, and
 * addMessage's own return, which also backs the plaza:message broadcast) a
 * message that has `skillId` but no `attachment` gets one synthesized -
 * `{ kind: "skill", skillId }` - so a client only ever needs to render
 * `attachment`, never both fields separately (see withNormalizedAttachment).
 *
 * A message may also optionally carry `replyTo`, the id of the message it
 * replies to - a single-level "comment" feature. History stays flat and
 * chronological (posts and replies interleaved by `at`, same as always);
 * grouping replies under their parent into threads is a display concern for
 * the client, not something this module does. Max depth is 1: a message
 * that already has a `replyTo` cannot itself be replied to (rejected, see
 * addMessage) - deep/branching threads aren't supported. A reply's parent
 * must exist in the store AT SEND TIME, but is allowed to later fall out of
 * it (in-memory ring buffer eviction, see PLAZA_HISTORY_LIMIT) without
 * incident - the reply simply keeps a `replyTo` pointing at an id that may
 * no longer resolve; the client is expected to render such an orphan as a
 * standalone post rather than the server ever crashing or backfilling.
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
import { BOARD_SIZE, MAX_NUMBER, MIN_NUMBER, validateBoard } from "../engine/board.ts";

/**
 * Max messages kept/returned as history. 300 (not 100) so a reply's parent
 * survives long enough in the in-memory ring buffer to still resolve for
 * most threads - see this file's doc on `replyTo` for what happens when a
 * parent does age out anyway.
 */
export const PLAZA_HISTORY_LIMIT = 300;
/** Minimum time between two messages from the same socket. */
export const PLAZA_RATE_LIMIT_MS = 2000;

const MAX_NICKNAME_LENGTH = 24;
const MAX_TEXT_LENGTH = 280;
const MAX_ATTACHMENT_OPPONENT_LENGTH = 24;
const MIN_ATTACHMENT_LINES = 0;
/** 5 rows + 5 cols + 2 diagonals - the max number of lines a 5x5 board can ever complete at once. */
const MAX_ATTACHMENT_LINES = 12;
const MIN_ATTACHMENT_CALLS = 1;
const MAX_ATTACHMENT_CALLS = 25;

/**
 * Structured attachment a Plaza message can carry, in place of (or alongside)
 * the legacy `skillId` field - CONCEPT.md §7.4b's "showcase" use case, now
 * covering three shapes: a skill card, a match result card, and a board
 * snapshot. Exact shape mandated by the FE contract (server/API.md's
 * "Plaza chat" section) - do not rename/reshape fields here without also
 * updating the web client. Every kind is validated strictly, see
 * validateAttachment - this is user input, never trusted as-is.
 */
export type PlazaAttachment =
  | { kind: "skill"; skillId: number }
  | { kind: "result"; won: boolean; lines: number; calls: number; opponent?: string }
  | { kind: "board"; numbers: number[]; marked?: number[] };

export interface PlazaMessage {
  readonly id: string;
  readonly nickname: string;
  readonly text: string;
  /** Skill token id the sender is showing off, if any - see CONCEPT.md §7.4b. Legacy field, superseded by `attachment` - see this file's doc. */
  readonly skillId?: number;
  /** Id of the parent message this replies to, absent for a top-level post - see this file's doc. */
  readonly replyTo?: string;
  readonly at: number;
  /** Structured showcase attachment (skill card / result card / board snapshot) - see PlazaAttachment and this file's doc on `skillId` normalization. */
  readonly attachment?: PlazaAttachment;
}

export interface PlazaStore {
  /**
   * Validates + appends a message from `socketId`, enforcing
   * PLAZA_RATE_LIMIT_MS between two messages from the same socket. Rejects
   * (never throws synchronously) with a descriptive Error on any violation
   * (bad shape, too short/long, rate limited, bad `replyTo` - see below) -
   * callers (see realtime/server.ts's safeHandler) turn that into an ack
   * error rather than a crash. A rejected call never updates the
   * rate-limit clock, so a bad payload can't lock a socket out of its own
   * next (valid) attempt. `now` defaults to Date.now(), overridable for
   * tests. `accountId`, if the caller's socket already has one, is
   * persisted alongside the message (see this module's doc) but never
   * appears in the returned PlazaMessage itself.
   *
   * If `input.replyTo` is set, it's resolved against the store: missing ->
   * rejected ("Parent message not found"); resolves to a message that is
   * ITSELF a reply (has its own `replyTo`) -> rejected (max depth 1). See
   * this file's top doc for the reasoning.
   *
   * If `input.attachment` is set, it's strictly shape-validated per `kind`
   * (see validateAttachment) BEFORE the rate-limit clock is touched, same as
   * `replyTo` above - a rejected attachment never consumes the sender's
   * rate-limit slot, and is never partially stored. The returned message
   * (and therefore also whatever realtime/server.ts broadcasts as
   * plaza:message) always has `attachment` normalized - see
   * withNormalizedAttachment - so a caller only needs to render one field.
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

/** Shape-only check - existence + depth (max 1 level) are checked against the store in addMessage. */
function validateReplyTo(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error("replyTo must be a non-empty string");
  }
  return value;
}

// -- attachment validation ------------------------------------------------
//
// A message's `attachment` is untrusted chat input, same trust boundary as
// nickname/text/replyTo above - every kind below is validated FULLY before
// addMessage ever stores anything, so a bad attachment always rejects the
// whole message rather than getting silently dropped or half-stored (see
// this file's top doc).

function validatePositiveInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new Error(`${field} must be a positive integer`);
  }
  return value;
}

function validateIntegerInRange(value: unknown, field: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${field} must be an integer between ${min} and ${max}`);
  }
  return value;
}

/** `{ kind: "result", won, lines, calls, opponent? }` - a match result card, CONCEPT.md §7.4b's "pamer hasil match". */
function validateResultAttachment(raw: Record<string, unknown>): PlazaAttachment {
  if (typeof raw.won !== "boolean") throw new Error("attachment.won must be a boolean");
  const lines = validateIntegerInRange(raw.lines, "attachment.lines", MIN_ATTACHMENT_LINES, MAX_ATTACHMENT_LINES);
  const calls = validateIntegerInRange(raw.calls, "attachment.calls", MIN_ATTACHMENT_CALLS, MAX_ATTACHMENT_CALLS);

  let opponent: string | undefined;
  if (raw.opponent !== undefined) {
    if (typeof raw.opponent !== "string") throw new Error("attachment.opponent must be a string");
    opponent = raw.opponent.trim();
    if (opponent.length > MAX_ATTACHMENT_OPPONENT_LENGTH) {
      throw new Error(`attachment.opponent must be at most ${MAX_ATTACHMENT_OPPONENT_LENGTH} characters`);
    }
  }

  return { kind: "result", won: raw.won, lines, calls, ...(opponent !== undefined ? { opponent } : {}) };
}

/**
 * Array of at most BOARD_SIZE unique integers in [MIN_NUMBER, MAX_NUMBER] -
 * the length check runs BEFORE the per-element loop so an oversized array is
 * rejected in O(1) (this file's "batasi payload lampiran wajar" rule),
 * rather than iterated first.
 */
function validateMarkedCells(value: unknown): number[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new Error("attachment.marked must be an array");
  if (value.length > BOARD_SIZE) {
    throw new Error(`attachment.marked must contain at most ${BOARD_SIZE} entries`);
  }
  const seen = new Set<number>();
  const marked: number[] = [];
  for (const entry of value) {
    if (typeof entry !== "number" || !Number.isInteger(entry) || entry < MIN_NUMBER || entry > MAX_NUMBER) {
      throw new Error(`attachment.marked must contain only integers between ${MIN_NUMBER} and ${MAX_NUMBER}`);
    }
    if (seen.has(entry)) throw new Error("attachment.marked must not contain duplicate numbers");
    seen.add(entry);
    marked.push(entry);
  }
  return marked;
}

/** `{ kind: "board", numbers, marked? }` - a board snapshot. `numbers` reuses engine/board.ts's validateBoard (the SAME rule a draft:submit board must pass), so a shown-off board is always a structurally legal one. */
function validateBoardAttachment(raw: Record<string, unknown>): PlazaAttachment {
  if (!Array.isArray(raw.numbers)) throw new Error("attachment.numbers must be an array");
  const validation = validateBoard(raw.numbers as number[]);
  if (!validation.valid) throw new Error(`attachment.numbers: ${validation.error}`);

  const marked = validateMarkedCells(raw.marked);
  return { kind: "board", numbers: raw.numbers as number[], ...(marked !== undefined ? { marked } : {}) };
}

/**
 * Validates the optional structured `attachment` (see PlazaAttachment) -
 * `kind: "skill"` here is the exact shape the legacy top-level `skillId`
 * field normalizes to on read (see withNormalizedAttachment below), so a
 * client that has already migrated to sending `attachment: { kind: "skill",
 * skillId }` directly works identically to one still on the old field.
 * Any `kind` outside the three known ones is rejected with a clear message
 * - never silently ignored.
 */
function validateAttachment(value: unknown): PlazaAttachment | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("attachment must be an object");
  }
  const raw = value as Record<string, unknown>;
  switch (raw.kind) {
    case "skill":
      return { kind: "skill", skillId: validatePositiveInteger(raw.skillId, "attachment.skillId") };
    case "result":
      return validateResultAttachment(raw);
    case "board":
      return validateBoardAttachment(raw);
    default:
      throw new Error('attachment.kind must be "skill", "result", or "board"');
  }
}

/**
 * Backward compatibility (this file's top doc): a message that has the
 * legacy `skillId` field but no `attachment` - true for every row written
 * before this feature shipped, and for any client that still only sends
 * `skillId` - gets a synthetic `{ kind: "skill", skillId }` attachment on
 * every READ path (getHistory, and addMessage's own return value, which is
 * also what realtime/server.ts broadcasts as plaza:message). Storage itself
 * is untouched: `attachment` is persisted exactly as given, possibly absent
 * - see PlazaBackend.insert.
 */
function withNormalizedAttachment(message: PlazaMessage): PlazaMessage {
  if (message.attachment || message.skillId === undefined) return message;
  return { ...message, attachment: { kind: "skill", skillId: message.skillId } };
}

// -- storage backends -----------------------------------------------------
//
// Deliberately separate from rate limiting (createPlazaStore below owns
// that, always in-memory) - a backend only ever needs to insert one message
// and answer "what's the history", nothing about sockets/timing.

interface PlazaBackend {
  insert(message: PlazaMessage, accountId: string | undefined): Promise<void>;
  getHistory(): Promise<PlazaMessage[]>;
  /**
   * Looks up a single message by id, regardless of whether it's still
   * within the PLAZA_HISTORY_LIMIT window returned by getHistory() -
   * addMessage uses this to validate a `replyTo` at send time. Returns
   * undefined if no such message exists (e.g. never existed, or - for the
   * in-memory backend only - it aged out of the ring buffer).
   */
  findById(id: string): Promise<PlazaMessage | undefined>;
}

function createInMemoryBackend(): PlazaBackend {
  const history: PlazaMessage[] = [];

  return {
    async insert(message) {
      history.push(message);
      if (history.length > PLAZA_HISTORY_LIMIT) history.shift();
    },

    async getHistory() {
      // .map (not .slice) so the defensive copy ALSO carries the
      // legacy-skillId -> attachment normalization (see
      // withNormalizedAttachment) - stored entries themselves are never
      // mutated, only what's returned to a caller.
      return history.map(withNormalizedAttachment);
    },

    async findById(id) {
      return history.find((m) => m.id === id);
    },
  };
}

interface PlazaMessageRow {
  readonly id: string;
  readonly nickname: string;
  readonly text: string;
  readonly skill_id: number | null;
  readonly reply_to: string | null;
  readonly created_at: Date;
  /** jsonb column - already parsed into a plain object (or null) by `pg`'s built-in jsonb type parser, no manual JSON.parse needed. */
  readonly attachment: PlazaAttachment | null;
}

function rowToMessage(row: PlazaMessageRow): PlazaMessage {
  return withNormalizedAttachment({
    id: row.id,
    nickname: row.nickname,
    text: row.text,
    skillId: row.skill_id ?? undefined,
    replyTo: row.reply_to ?? undefined,
    at: row.created_at.getTime(),
    attachment: row.attachment ?? undefined,
  });
}

function createPostgresBackend(pg: Pool): PlazaBackend {
  return {
    async insert(message, accountId) {
      // `message.attachment` is either undefined (-> null, column stays
      // NULL) or a plain PlazaAttachment object - `pg` JSON.stringifies
      // plain objects automatically for a jsonb parameter, no manual
      // JSON.stringify needed (see this file's doc + PlazaMessageRow).
      await pg.query(
        `INSERT INTO plaza_messages (id, player_id, nickname, text, skill_id, reply_to, attachment, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          message.id,
          accountId ?? null,
          message.nickname,
          message.text,
          message.skillId ?? null,
          message.replyTo ?? null,
          message.attachment ?? null,
          new Date(message.at),
        ],
      );
    },

    async getHistory() {
      const result = await pg.query<PlazaMessageRow>(
        `SELECT id, nickname, text, skill_id, reply_to, attachment, created_at FROM plaza_messages ORDER BY created_at DESC LIMIT $1`,
        [PLAZA_HISTORY_LIMIT],
      );
      return result.rows.map(rowToMessage).reverse(); // DESC (most-recent-first query) -> ASC (oldest -> newest, matching the in-memory backend's order).
    },

    async findById(id) {
      try {
        const result = await pg.query<PlazaMessageRow>(
          `SELECT id, nickname, text, skill_id, reply_to, attachment, created_at FROM plaza_messages WHERE id = $1`,
          [id],
        );
        return result.rows[0] ? rowToMessage(result.rows[0]) : undefined;
      } catch (err) {
        // `id` is a client-supplied `replyTo` string, not necessarily a
        // well-formed uuid (the column type). Postgres rejects a malformed
        // one at the type-cast level (code 22P02) before it could ever
        // match a row anyway - treat that exactly like "not found" instead
        // of leaking a raw Postgres error to the client. Any OTHER error
        // (e.g. connection lost) still propagates normally.
        if ((err as { code?: string }).code === "22P02") return undefined;
        throw err;
      }
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
      const replyTo = validateReplyTo(raw.replyTo);
      const attachment = validateAttachment(raw.attachment);

      if (replyTo !== undefined) {
        const parent = await backend.findById(replyTo);
        if (!parent) throw new Error("Parent message not found");
        if (parent.replyTo !== undefined) throw new Error("Cannot reply to a reply - max thread depth is 1");
      }

      const message: PlazaMessage = { id: randomUUID(), nickname, text, skillId, replyTo, attachment, at: now };
      lastSentAt.set(socketId, now);
      await backend.insert(message, accountId);
      // Normalized on the way out (this file's doc) - the ack AND the
      // plaza:message broadcast (realtime/server.ts just forwards this
      // return value) both see `attachment` populated even for a
      // legacy-shape send (skillId only, no attachment).
      return withNormalizedAttachment(message);
    },

    getHistory() {
      return backend.getHistory();
    },
  };
}

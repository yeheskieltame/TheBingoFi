/**
 * Plaza chat: pure, in-memory logic behind the global (not per-room) social
 * chat channel - CONCEPT.md §7.4b "Plaza — Ruang Sosial & Showcase". Kept
 * separate from realtime/server.ts's socket wiring so the ring buffer,
 * validation, and rate limiting can be unit tested without a socket at all
 * (see plaza.test.ts) - server.ts only forwards raw payloads in and
 * broadcasts whatever comes back out.
 *
 * A message may optionally carry `skillId` - CONCEPT.md §7.4b: "pesan chat
 * bisa melampirkan kartu skill yang dimiliki (render sebagai kartu, bukan
 * teks)". This module never checks ownership of that skillId (that's a
 * chain/reader.ts concern, and Plaza works for guests too) - it only
 * shape-validates it as a plausible token id.
 *
 * // ponytail: in-memory ring buffer, resets on restart, no persistence and
 * no report/mute moderation yet - CONCEPT.md §7.4b: "Moderasi: rate limit +
 * panjang pesan dulu; report/mute menyusul."
 */

import { randomUUID } from "node:crypto";

/** Max messages kept in the history ring buffer. */
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
   * PLAZA_RATE_LIMIT_MS between two messages from the same socket. Throws a
   * descriptive Error on any violation (bad shape, too short/long, rate
   * limited) - callers (see realtime/server.ts's safeHandler) turn that
   * into an ack error rather than a crash. A rejected call never updates
   * the rate-limit clock, so a bad payload can't lock a socket out of its
   * own next (valid) attempt. `now` defaults to Date.now(), overridable for
   * tests.
   */
  addMessage(socketId: string, input: unknown, now?: number): PlazaMessage;
  /** Buffer contents, oldest -> newest (at most PLAZA_HISTORY_LIMIT). */
  getHistory(): PlazaMessage[];
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

/**
 * Builds a fresh, independent Plaza store - one per realtime server (see
 * realtime/server.ts), deliberately never a module-level singleton so
 * separate server instances (e.g. one per test) never bleed history or
 * rate-limit state into each other.
 */
export function createPlazaStore(): PlazaStore {
  const history: PlazaMessage[] = [];
  const lastSentAt = new Map<string, number>();

  return {
    addMessage(socketId, input, now = Date.now()) {
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
      history.push(message);
      if (history.length > PLAZA_HISTORY_LIMIT) history.shift();
      return message;
    },

    getHistory() {
      return history.slice();
    },
  };
}

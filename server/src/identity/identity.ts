/**
 * Stable player identity: a token-based handshake (`identity:hello`, see
 * realtime/server.ts) so quest progress / leaderboard entries survive
 * across matches and reconnects - unlike the fresh `randomUUID()`
 * rooms.ts hands out on every `room:create`/`room:join` (that one is
 * unchanged and stays ephemeral on purpose - it's the per-room seat id used
 * for turn order and board redaction, see rooms.ts's `RoomPlayer.playerId`
 * and CLAUDE.md's turn-based rules). This module is the *stable* side: one
 * `players` row per real player/device, looked up by the sha256 hash of a
 * token only the client ever holds in the clear - see server/API.md's
 * "Identity" section for the full flow and why (the old behavior reset
 * quest progress on every match, since it was keyed on the ephemeral id).
 *
 * Two backends behind one interface (IdentityStore), chosen automatically
 * by db/pool.ts's `pool` presence, same pattern as api/questStore.ts,
 * api/dailyLeaderboard.ts, and plaza/plaza.ts:
 *  - in-memory: Maps, resets on restart - fine, since it's only ever
 *    selected when there's no Postgres to persist to anyway.
 *  - Postgres: the `players` table (db/schema.sql).
 *
 * The plaintext token is NEVER stored anywhere, only its sha256 hash
 * (`token_hash`) - see hashToken. A caller who only has the hash (e.g. by
 * reading the database directly) can never reconstruct a working token.
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Pool } from "pg";

import { pool as defaultPool } from "../db/pool.ts";

export interface IdentityHelloResult {
  readonly playerId: string;
  readonly token: string;
}

export interface IdentityStore {
  /**
   * Looks up `token` by its sha256 hash and, if found, returns the SAME
   * `playerId`/`token` back (never rotates the token - a client that
   * already has a working token keeps using it forever) and touches
   * `last_seen_at`. If `token` is absent, unknown, or expired-in-spirit
   * (there's no TTL - a lost token just means a lost identity), creates a
   * brand-new player (`randomUUID()` id, a fresh 32-byte random token) and
   * returns that instead - this path never throws; an unrecognized token is
   * not an error, just "start a new identity" (see server/API.md).
   */
  hello(token?: string): Promise<IdentityHelloResult>;
  /**
   * Links `wallet` (already-lowercased, see realtime/server.ts's
   * `wallet:link`) to `playerId`. Throws a human-readable Error if `wallet`
   * is already linked to a DIFFERENT player - "satu wallet = satu akun"
   * (this task's spec). Re-linking the SAME wallet to the SAME player is a
   * no-op success (idempotent).
   */
  linkWallet(playerId: string, wallet: string): Promise<void>;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function generateToken(): string {
  return randomBytes(32).toString("hex");
}

// -- in-memory ------------------------------------------------------------

interface PlayerRecord {
  readonly id: string;
  readonly tokenHash: string;
  wallet?: string;
  lastSeenAt: number;
}

function createInMemoryIdentityStore(): IdentityStore {
  const byTokenHash = new Map<string, PlayerRecord>();
  const byId = new Map<string, PlayerRecord>();
  const playerIdByWallet = new Map<string, string>();

  return {
    async hello(token) {
      if (token) {
        const existing = byTokenHash.get(hashToken(token));
        if (existing) {
          existing.lastSeenAt = Date.now();
          return { playerId: existing.id, token };
        }
      }

      const newToken = generateToken();
      const record: PlayerRecord = { id: randomUUID(), tokenHash: hashToken(newToken), lastSeenAt: Date.now() };
      byTokenHash.set(record.tokenHash, record);
      byId.set(record.id, record);
      return { playerId: record.id, token: newToken };
    },

    async linkWallet(playerId, wallet) {
      const record = byId.get(playerId);
      if (!record) throw new Error(`Unknown player ${playerId}`);

      const owner = playerIdByWallet.get(wallet);
      if (owner && owner !== playerId) {
        throw new Error("Wallet is already linked to another account");
      }

      if (record.wallet && record.wallet !== wallet) playerIdByWallet.delete(record.wallet);
      record.wallet = wallet;
      playerIdByWallet.set(wallet, playerId);
    },
  };
}

// -- postgres ---------------------------------------------------------------

const PG_UNIQUE_VIOLATION = "23505";

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: unknown }).code === PG_UNIQUE_VIOLATION;
}

function createPostgresIdentityStore(pg: Pool): IdentityStore {
  return {
    async hello(token) {
      if (token) {
        const found = await pg.query<{ id: string }>(
          `UPDATE players SET last_seen_at = now() WHERE token_hash = $1 RETURNING id`,
          [hashToken(token)],
        );
        if (found.rows.length > 0) return { playerId: found.rows[0]!.id, token };
      }

      const newToken = generateToken();
      const id = randomUUID();
      await pg.query(`INSERT INTO players (id, token_hash) VALUES ($1, $2)`, [id, hashToken(newToken)]);
      return { playerId: id, token: newToken };
    },

    async linkWallet(playerId, wallet) {
      try {
        const result = await pg.query(`UPDATE players SET wallet = $1 WHERE id = $2`, [wallet, playerId]);
        if (result.rowCount === 0) throw new Error(`Unknown player ${playerId}`);
      } catch (err) {
        if (isUniqueViolation(err)) throw new Error("Wallet is already linked to another account");
        throw err;
      }
    },
  };
}

// -- factory ------------------------------------------------------------

/** Picks the Postgres-backed store when `pg` (default: db/pool.ts's module-level pool) is set, else the in-memory one. */
export function createIdentityStore(pg: Pool | undefined = defaultPool): IdentityStore {
  return pg ? createPostgresIdentityStore(pg) : createInMemoryIdentityStore();
}

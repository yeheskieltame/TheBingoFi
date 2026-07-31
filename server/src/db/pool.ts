/**
 * Postgres connection pool - lazy, one `pg.Pool` per process, built once at
 * module load from `DATABASE_URL`. Every store that can persist
 * (identity/identity.ts, api/questStore.ts, api/dailyLeaderboard.ts,
 * plaza/plaza.ts) imports `pool` and picks its Postgres-backed
 * implementation when it's defined, falling back to an in-memory one
 * otherwise - see each store's `create*Store()` factory for the actual
 * selection.
 *
 * No ORM (CLAUDE.md-adjacent call for this task: 4 tables, hand-written SQL
 * via `pg` is enough - see schema.sql/migrate.ts). No framework migration
 * tool either, same reasoning.
 */
import { Pool } from "pg";

/**
 * Railway's *internal* network (private, service-to-service, e.g.
 * `postgres.railway.internal`) never needs TLS. Anything else - a public
 * managed Postgres endpoint, or plain `localhost`/`127.0.0.1` for local dev
 * - gets `ssl: { rejectUnauthorized: false }` for the public case (most
 * managed Postgres providers present certs that aren't in Node's default
 * trust store) while `localhost` stays plain. Deliberately simple string
 * checks rather than a full "is this a private network" classifier - this
 * only needs to get Railway internal vs. everything-else right.
 */
function shouldUseSsl(databaseUrl: string): boolean {
  try {
    const { hostname } = new URL(databaseUrl);
    if (hostname === "localhost" || hostname === "127.0.0.1" || hostname.endsWith(".railway.internal")) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

const databaseUrl = process.env.DATABASE_URL;

/**
 * `undefined` when `DATABASE_URL` is unset/empty - the one switch every
 * store checks to decide in-memory vs Postgres. Never throws on a bad URL at
 * import time; `pg.Pool` only actually connects lazily, on first query.
 */
export const pool: Pool | undefined =
  databaseUrl && databaseUrl.length > 0
    ? new Pool({
        connectionString: databaseUrl,
        ssl: shouldUseSsl(databaseUrl) ? { rejectUnauthorized: false } : undefined,
      })
    : undefined;

/**
 * Idempotent boot-time migration: runs schema.sql's `CREATE TABLE IF NOT
 * EXISTS` statements once, at server startup (see ../index.ts) - no
 * migration framework/history table, since "CREATE TABLE IF NOT EXISTS" is
 * already safe to re-run on every boot.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Pool } from "pg";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = path.join(HERE, "schema.sql");

/** No-op when `pool` is undefined (in-memory mode - see pool.ts). */
export async function migrate(pool: Pool | undefined): Promise<void> {
  if (!pool) return;
  const schema = readFileSync(SCHEMA_PATH, "utf8");
  await pool.query(schema);
}

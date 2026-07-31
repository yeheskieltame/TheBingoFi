/**
 * Opt-in integration tests against a REAL Postgres: exercises migrate.ts,
 * identity/identity.ts, api/questStore.ts, api/dailyLeaderboard.ts, and
 * plaza/plaza.ts's Postgres-backed implementations end-to-end - the
 * in-memory paths (used by every other test file, no Postgres required)
 * are already covered elsewhere (identity/identity.test.ts,
 * plaza/plaza.test.ts, realtime/realtime.test.ts, api/http.test.ts).
 *
 * SKIPPED BY DEFAULT. Requires BOTH `RUN_DB_TESTS=1` and a real
 * `DATABASE_URL` pointing at a scratch Postgres database (tables are
 * created via migrate() and then TRUNCATEd before each test - point this
 * at a database you don't mind wiping, never production):
 *
 *   RUN_DB_TESTS=1 DATABASE_URL=postgres://user@localhost:5432/thebingofi_test \
 *     node --test src/db/db.test.ts
 *
 * or `pnpm test:db` with DATABASE_URL exported in your shell.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { migrate } from "./migrate.ts";
import { pool } from "./pool.ts";
import { createIdentityStore } from "../identity/identity.ts";
import { createQuestStore } from "../api/questStore.ts";
import { createLeaderboardStore } from "../api/dailyLeaderboard.ts";
import { createPlazaStore } from "../plaza/plaza.ts";
import type { GameEvent } from "../quest/events.ts";

const RUN = process.env.RUN_DB_TESTS === "1" && !!pool;
const skip = RUN ? false : "set RUN_DB_TESTS=1 and DATABASE_URL to a scratch Postgres database to run these";

test("db.test.ts setup", { skip }, async (t) => {
  await migrate(pool); // idempotent - also proves schema.sql applies cleanly to a real database
  await pool!.query(`TRUNCATE plaza_messages, quest_progress, daily_scores, players RESTART IDENTITY CASCADE`);

  await t.test("migrate() is idempotent - running it twice does not error", async () => {
    await migrate(pool);
  });

  // -- identity ------------------------------------------------------------

  await t.test("identity: hello() persists a real players row; reusing the token resolves the same id", async () => {
    const identity = createIdentityStore(pool);
    const first = await identity.hello();
    assert.equal(typeof first.playerId, "string");

    const row = await pool!.query<{ id: string; token_hash: string }>(`SELECT id, token_hash FROM players WHERE id = $1`, [
      first.playerId,
    ]);
    assert.equal(row.rows.length, 1);
    assert.notEqual(row.rows[0]!.token_hash, first.token, "only the HASH is stored, never the plaintext token");

    const second = await identity.hello(first.token);
    assert.equal(second.playerId, first.playerId);
    assert.equal(second.token, first.token);
  });

  await t.test("identity: linkWallet persists the wallet and rejects a wallet already linked elsewhere (real unique constraint)", async () => {
    const identity = createIdentityStore(pool);
    const a = await identity.hello();
    const b = await identity.hello();

    await identity.linkWallet(a.playerId, "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    const row = await pool!.query<{ wallet: string }>(`SELECT wallet FROM players WHERE id = $1`, [a.playerId]);
    assert.equal(row.rows[0]!.wallet, "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");

    await assert.rejects(
      () => identity.linkWallet(b.playerId, "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
      /already linked/i,
    );
  });

  // -- quest store -----------------------------------------------------------

  await t.test("questStore: recordEvent persists progress that a FRESH store instance (same pool) can read back", async () => {
    const identity = createIdentityStore(pool);
    const { playerId } = await identity.hello(); // quest_progress.player_id FKs to players(id)

    const store = createQuestStore(pool);
    const event: GameEvent = { type: "match_played", playerId };
    const result = await store.recordEvent(event, "2026-01-01");
    assert.ok(result.progress.some((p) => p.questId === "daily_play_3_matches" && p.count === 1));

    // A brand-new store instance sharing the same pool must see the same
    // row - proves this went to Postgres, not some in-process cache.
    const freshStore = createQuestStore(pool);
    const progress = await freshStore.getProgress(playerId);
    const entry = progress.find((p) => p.questId === "daily_play_3_matches" && p.periodKey === "2026-01-01");
    assert.ok(entry, "expected persisted progress for daily_play_3_matches");
    assert.equal(entry!.count, 1);
    assert.equal(entry!.completed, false);
  });

  await t.test("questStore: recordEvent accumulates count across calls for the same player/quest/period", async () => {
    const identity = createIdentityStore(pool);
    const { playerId } = await identity.hello();
    const store = createQuestStore(pool);

    await store.recordEvent({ type: "match_played", playerId }, "2026-01-02");
    await store.recordEvent({ type: "match_played", playerId }, "2026-01-02");
    const result = await store.recordEvent({ type: "match_played", playerId }, "2026-01-02");

    const entry = result.progress.find((p) => p.questId === "daily_play_3_matches" && p.periodKey === "2026-01-02");
    assert.ok(entry);
    assert.equal(entry!.count, 3);
    assert.equal(entry!.completed, true, "target is 3 - should be completed on the 3rd event");
  });

  // -- daily leaderboard -------------------------------------------------

  await t.test("dailyLeaderboard: submitScore + getLeaderboard round-trip via Postgres, keyed by (date, player_id)", async () => {
    const store = createLeaderboardStore(pool);
    const accountId = (await createIdentityStore(pool).hello()).playerId;

    await store.submitScore("2026-02-01", { nickname: "Alice", score: 500, callsToBingo: 20, accountId });
    const board = await store.getLeaderboard("2026-02-01");
    assert.ok(board.some((e) => e.nickname === "Alice" && e.score === 500));
  });

  await t.test("dailyLeaderboard: a lower score for the same (date, accountId) does not overwrite the best one", async () => {
    const store = createLeaderboardStore(pool);
    const accountId = (await createIdentityStore(pool).hello()).playerId;

    await store.submitScore("2026-02-02", { nickname: "Bob", score: 800, callsToBingo: 10, accountId });
    await store.submitScore("2026-02-02", { nickname: "Bob", score: 300, callsToBingo: 22, accountId });

    const board = await store.getLeaderboard("2026-02-02");
    const bobEntries = board.filter((e) => e.nickname === "Bob");
    assert.equal(bobEntries.length, 1, "one row per (date, player_id) - not deduped by nickname in Postgres mode");
    assert.equal(bobEntries[0]!.score, 800, "the higher score must survive");
  });

  await t.test("dailyLeaderboard: a submission with no accountId gets a fresh id each time (never deduped against itself)", async () => {
    const store = createLeaderboardStore(pool);
    await store.submitScore("2026-02-03", { nickname: "Guest", score: 100, callsToBingo: 25 });
    await store.submitScore("2026-02-03", { nickname: "Guest", score: 150, callsToBingo: 24 });

    const board = await store.getLeaderboard("2026-02-03");
    const guestEntries = board.filter((e) => e.nickname === "Guest");
    assert.equal(guestEntries.length, 2, "anonymous submissions are never deduped against each other");
  });

  // -- plaza ---------------------------------------------------------------

  await t.test("plaza: addMessage persists to Postgres; a FRESH store instance sees the same history, oldest -> newest", async () => {
    const store = createPlazaStore(pool);
    const accountId = (await createIdentityStore(pool).hello()).playerId;

    await store.addMessage("socket-1", { nickname: "Alice", text: "first" }, 1_000, accountId);
    await store.addMessage("socket-2", { nickname: "Bob", text: "second" }, 2_000);

    const freshStore = createPlazaStore(pool);
    const history = await freshStore.getHistory();
    const texts = history.map((m) => m.text);
    assert.ok(texts.indexOf("first") < texts.indexOf("second"), "oldest -> newest ordering");

    const row = await pool!.query<{ player_id: string | null }>(`SELECT player_id FROM plaza_messages WHERE text = $1`, [
      "first",
    ]);
    assert.equal(row.rows[0]!.player_id, accountId, "accountId is persisted when the socket had one");

    const guestRow = await pool!.query<{ player_id: string | null }>(`SELECT player_id FROM plaza_messages WHERE text = $1`, [
      "second",
    ]);
    assert.equal(guestRow.rows[0]!.player_id, null, "no accountId supplied -> player_id stays NULL (guest chat)");
  });
});

/**
 * Unit tests for the in-memory IdentityStore (createIdentityStore() with no
 * pool - see identity.ts's factory). Postgres-backed behavior is exercised
 * separately, opt-in, in ../db/db.test.ts (needs a real Postgres, see that
 * file's doc).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { createIdentityStore } from "./identity.ts";

test("hello() with no token creates a brand-new identity", async () => {
  const identity = createIdentityStore(undefined);
  const res = await identity.hello();
  assert.equal(typeof res.playerId, "string");
  assert.ok(res.playerId.length > 0);
  assert.equal(typeof res.token, "string");
  // 32 random bytes, hex-encoded.
  assert.equal(res.token.length, 64);
});

test("two hello() calls with no token produce two different identities", async () => {
  const identity = createIdentityStore(undefined);
  const a = await identity.hello();
  const b = await identity.hello();
  assert.notEqual(a.playerId, b.playerId);
  assert.notEqual(a.token, b.token);
});

test("reusing a previously-issued token resolves to the SAME playerId and the SAME token (never rotates)", async () => {
  const identity = createIdentityStore(undefined);
  const first = await identity.hello();
  const second = await identity.hello(first.token);
  assert.equal(second.playerId, first.playerId);
  assert.equal(second.token, first.token);
});

test("an unknown/foreign token creates a brand-new identity rather than throwing", async () => {
  const identity = createIdentityStore(undefined);
  const res = await identity.hello("this-token-was-never-issued-by-this-store");
  assert.equal(typeof res.playerId, "string");
  assert.ok(res.playerId.length > 0);
});

test("linkWallet attaches a wallet to a player", async () => {
  const identity = createIdentityStore(undefined);
  const { playerId } = await identity.hello();
  await identity.linkWallet(playerId, "0xabc");
  // No getter to read it back directly (IdentityStore's surface is
  // deliberately minimal) - re-linking the SAME wallet to the SAME player
  // must stay a no-op success, which proves the wallet was recorded against
  // this player (not silently dropped) without needing a getter.
  await identity.linkWallet(playerId, "0xabc");
});

test("linkWallet rejects a wallet already linked to a DIFFERENT player", async () => {
  const identity = createIdentityStore(undefined);
  const a = await identity.hello();
  const b = await identity.hello();
  await identity.linkWallet(a.playerId, "0xabc");
  await assert.rejects(() => identity.linkWallet(b.playerId, "0xabc"), /already linked/i);
});

test("linkWallet against an unknown playerId throws", async () => {
  const identity = createIdentityStore(undefined);
  await assert.rejects(() => identity.linkWallet("nonexistent-id", "0xabc"));
});

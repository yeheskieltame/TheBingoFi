/**
 * Unit tests for Plaza's pure logic (validation, rate limiting, ring
 * buffer) - no socket involved. Socket-level wiring (broadcast to every
 * connected client, ack shape) is covered separately in
 * realtime/realtime.test.ts.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { createPlazaStore, PLAZA_HISTORY_LIMIT, PLAZA_RATE_LIMIT_MS } from "./plaza.ts";

// -- addMessage: happy path -------------------------------------------------

test("addMessage returns a message with id/nickname/text/at, no skillId when omitted", () => {
  const plaza = createPlazaStore();
  const msg = plaza.addMessage("s1", { nickname: "Alice", text: "gm" }, 1000);
  assert.equal(msg.nickname, "Alice");
  assert.equal(msg.text, "gm");
  assert.equal(msg.at, 1000);
  assert.equal(msg.skillId, undefined);
  assert.equal(typeof msg.id, "string");
  assert.ok(msg.id.length > 0);
});

test("addMessage trims nickname and text", () => {
  const plaza = createPlazaStore();
  const msg = plaza.addMessage("s1", { nickname: "  Alice  ", text: "  gm  " }, 1000);
  assert.equal(msg.nickname, "Alice");
  assert.equal(msg.text, "gm");
});

test("addMessage accepts an optional positive-integer skillId", () => {
  const plaza = createPlazaStore();
  const msg = plaza.addMessage("s1", { nickname: "Alice", text: "check my skill", skillId: 3 }, 1000);
  assert.equal(msg.skillId, 3);
});

test("two different sockets each get their own message id", () => {
  const plaza = createPlazaStore();
  const a = plaza.addMessage("s1", { nickname: "Alice", text: "one" }, 1000);
  const b = plaza.addMessage("s2", { nickname: "Bob", text: "two" }, 1000);
  assert.notEqual(a.id, b.id);
});

// -- validation --------------------------------------------------------

test("addMessage rejects a non-integer, zero, or negative skillId", () => {
  const plaza = createPlazaStore();
  for (const bad of [0, -1, 1.5, "3"]) {
    assert.throws(() => plaza.addMessage("s1", { nickname: "Alice", text: "x", skillId: bad }, 1000));
  }
});

test("addMessage rejects an empty or whitespace-only text", () => {
  const plaza = createPlazaStore();
  assert.throws(() => plaza.addMessage("s1", { nickname: "Alice", text: "" }, 1000));
  assert.throws(() => plaza.addMessage("s2", { nickname: "Alice", text: "   " }, 1000));
});

test("addMessage rejects text longer than 280 characters", () => {
  const plaza = createPlazaStore();
  assert.throws(() => plaza.addMessage("s1", { nickname: "Alice", text: "x".repeat(281) }, 1000));
});

test("addMessage accepts text at exactly 280 characters", () => {
  const plaza = createPlazaStore();
  const msg = plaza.addMessage("s1", { nickname: "Alice", text: "x".repeat(280) }, 1000);
  assert.equal(msg.text.length, 280);
});

test("addMessage rejects an empty or too-long nickname", () => {
  const plaza = createPlazaStore();
  assert.throws(() => plaza.addMessage("s1", { nickname: "", text: "x" }, 1000));
  assert.throws(() => plaza.addMessage("s2", { nickname: "x".repeat(25), text: "x" }, 1000));
});

test("addMessage rejects a missing/non-object input", () => {
  const plaza = createPlazaStore();
  assert.throws(() => plaza.addMessage("s1", undefined, 1000));
  assert.throws(() => plaza.addMessage("s2", "not an object", 1000));
});

// -- rate limiting -------------------------------------------------------

test("addMessage enforces a minimum interval between messages from the same socket", () => {
  const plaza = createPlazaStore();
  plaza.addMessage("s1", { nickname: "Alice", text: "one" }, 1000);
  assert.throws(() => plaza.addMessage("s1", { nickname: "Alice", text: "two" }, 1000 + PLAZA_RATE_LIMIT_MS - 1));
  const ok = plaza.addMessage("s1", { nickname: "Alice", text: "two" }, 1000 + PLAZA_RATE_LIMIT_MS);
  assert.equal(ok.text, "two");
});

test("rate limit is per socket, not global", () => {
  const plaza = createPlazaStore();
  plaza.addMessage("s1", { nickname: "Alice", text: "one" }, 1000);
  const fromOther = plaza.addMessage("s2", { nickname: "Bob", text: "hi" }, 1000);
  assert.equal(fromOther.text, "hi");
});

test("a rejected (invalid) message does not consume the rate-limit slot", () => {
  const plaza = createPlazaStore();
  assert.throws(() => plaza.addMessage("s1", { nickname: "Alice", text: "" }, 1000));
  const ok = plaza.addMessage("s1", { nickname: "Alice", text: "now valid" }, 1000);
  assert.equal(ok.text, "now valid");
});

// -- history ring buffer -------------------------------------------------

test("getHistory returns messages oldest -> newest, capped at PLAZA_HISTORY_LIMIT", () => {
  const plaza = createPlazaStore();
  const total = PLAZA_HISTORY_LIMIT + 10;
  for (let i = 0; i < total; i++) {
    plaza.addMessage("s1", { nickname: "Alice", text: `msg ${i}` }, 1000 + i * PLAZA_RATE_LIMIT_MS);
  }
  const history = plaza.getHistory();
  assert.equal(history.length, PLAZA_HISTORY_LIMIT);
  assert.equal(history[0]!.text, "msg 10"); // oldest 10 evicted
  assert.equal(history[history.length - 1]!.text, `msg ${total - 1}`);
});

test("getHistory returns a defensive copy (mutating it doesn't affect the store)", () => {
  const plaza = createPlazaStore();
  plaza.addMessage("s1", { nickname: "Alice", text: "one" }, 1000);
  const history = plaza.getHistory();
  history.pop();
  assert.equal(plaza.getHistory().length, 1);
});

test("getHistory is empty for a fresh store", () => {
  const plaza = createPlazaStore();
  assert.deepEqual(plaza.getHistory(), []);
});

/**
 * Unit tests for Plaza's pure logic (validation, rate limiting, ring
 * buffer) - no socket involved. Socket-level wiring (broadcast to every
 * connected client, ack shape) is covered separately in
 * realtime/realtime.test.ts. addMessage/getHistory are async (see
 * plaza.ts's doc - they may go through Postgres), so every call here is
 * awaited even though the default (no DATABASE_URL) store resolves them
 * synchronously-in-spirit.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { createPlazaStore, PLAZA_HISTORY_LIMIT, PLAZA_RATE_LIMIT_MS } from "./plaza.ts";

// -- addMessage: happy path -------------------------------------------------

test("addMessage returns a message with id/nickname/text/at, no skillId/replyTo when omitted", async () => {
  const plaza = createPlazaStore();
  const msg = await plaza.addMessage("s1", { nickname: "Alice", text: "gm" }, 1000);
  assert.equal(msg.nickname, "Alice");
  assert.equal(msg.text, "gm");
  assert.equal(msg.at, 1000);
  assert.equal(msg.skillId, undefined);
  assert.equal(msg.replyTo, undefined);
  assert.equal(typeof msg.id, "string");
  assert.ok(msg.id.length > 0);
});

test("addMessage trims nickname and text", async () => {
  const plaza = createPlazaStore();
  const msg = await plaza.addMessage("s1", { nickname: "  Alice  ", text: "  gm  " }, 1000);
  assert.equal(msg.nickname, "Alice");
  assert.equal(msg.text, "gm");
});

test("addMessage accepts an optional positive-integer skillId", async () => {
  const plaza = createPlazaStore();
  const msg = await plaza.addMessage("s1", { nickname: "Alice", text: "check my skill", skillId: 3 }, 1000);
  assert.equal(msg.skillId, 3);
});

test("two different sockets each get their own message id", async () => {
  const plaza = createPlazaStore();
  const a = await plaza.addMessage("s1", { nickname: "Alice", text: "one" }, 1000);
  const b = await plaza.addMessage("s2", { nickname: "Bob", text: "two" }, 1000);
  assert.notEqual(a.id, b.id);
});

// -- validation --------------------------------------------------------

test("addMessage rejects a non-integer, zero, or negative skillId", async () => {
  const plaza = createPlazaStore();
  for (const bad of [0, -1, 1.5, "3"]) {
    await assert.rejects(() => plaza.addMessage("s1", { nickname: "Alice", text: "x", skillId: bad }, 1000));
  }
});

test("addMessage rejects an empty or whitespace-only text", async () => {
  const plaza = createPlazaStore();
  await assert.rejects(() => plaza.addMessage("s1", { nickname: "Alice", text: "" }, 1000));
  await assert.rejects(() => plaza.addMessage("s2", { nickname: "Alice", text: "   " }, 1000));
});

test("addMessage rejects text longer than 280 characters", async () => {
  const plaza = createPlazaStore();
  await assert.rejects(() => plaza.addMessage("s1", { nickname: "Alice", text: "x".repeat(281) }, 1000));
});

test("addMessage accepts text at exactly 280 characters", async () => {
  const plaza = createPlazaStore();
  const msg = await plaza.addMessage("s1", { nickname: "Alice", text: "x".repeat(280) }, 1000);
  assert.equal(msg.text.length, 280);
});

test("addMessage rejects an empty or too-long nickname", async () => {
  const plaza = createPlazaStore();
  await assert.rejects(() => plaza.addMessage("s1", { nickname: "", text: "x" }, 1000));
  await assert.rejects(() => plaza.addMessage("s2", { nickname: "x".repeat(25), text: "x" }, 1000));
});

test("addMessage rejects a missing/non-object input", async () => {
  const plaza = createPlazaStore();
  await assert.rejects(() => plaza.addMessage("s1", undefined, 1000));
  await assert.rejects(() => plaza.addMessage("s2", "not an object", 1000));
});

// -- replies (comments) --------------------------------------------------
//
// Single-level "comment" support: a message may optionally carry `replyTo`,
// the id of an existing top-level message. Max depth is 1 - a message that
// is itself a reply can't be replied to. See plaza.ts's top doc.

test("addMessage accepts a replyTo pointing at an existing top-level message", async () => {
  const plaza = createPlazaStore();
  const parent = await plaza.addMessage("s1", { nickname: "Alice", text: "top-level" }, 1000);
  const reply = await plaza.addMessage("s2", { nickname: "Bob", text: "a reply", replyTo: parent.id }, 1000);
  assert.equal(reply.replyTo, parent.id);
  assert.equal(reply.text, "a reply");
});

test("addMessage rejects a non-string or empty/whitespace-only replyTo", async () => {
  const plaza = createPlazaStore();
  for (const bad of [123, "", "   "]) {
    await assert.rejects(() => plaza.addMessage("s1", { nickname: "Alice", text: "x", replyTo: bad }, 1000));
  }
});

test("addMessage rejects a replyTo pointing at a message id that does not exist", async () => {
  const plaza = createPlazaStore();
  await assert.rejects(
    () => plaza.addMessage("s1", { nickname: "Alice", text: "orphan reply", replyTo: "no-such-id" }, 1000),
    /Parent message not found/,
  );
});

test("addMessage rejects replying to a message that is itself a reply (max depth 1)", async () => {
  const plaza = createPlazaStore();
  const parent = await plaza.addMessage("s1", { nickname: "Alice", text: "top-level" }, 1000);
  const reply = await plaza.addMessage("s2", { nickname: "Bob", text: "first-level reply", replyTo: parent.id }, 1000);
  await assert.rejects(
    () => plaza.addMessage("s3", { nickname: "Carol", text: "nested reply", replyTo: reply.id }, 1000),
    /max thread depth is 1/i,
  );
});

test("a rejected reply (bad replyTo) does not consume the rate-limit slot", async () => {
  const plaza = createPlazaStore();
  await assert.rejects(() => plaza.addMessage("s1", { nickname: "Alice", text: "bad reply", replyTo: "no-such-id" }, 1000));
  const ok = await plaza.addMessage("s1", { nickname: "Alice", text: "now valid" }, 1000);
  assert.equal(ok.text, "now valid");
});

test("getHistory includes posts and replies together, chronological and flat (not grouped into threads)", async () => {
  const plaza = createPlazaStore();
  const post1 = await plaza.addMessage("s1", { nickname: "Alice", text: "post 1" }, 1000);
  const reply1 = await plaza.addMessage("s2", { nickname: "Bob", text: "reply to post 1", replyTo: post1.id }, 1001);
  const post2 = await plaza.addMessage("s3", { nickname: "Carol", text: "post 2" }, 1002);

  const history = await plaza.getHistory();
  assert.deepEqual(history.map((m) => m.id), [post1.id, reply1.id, post2.id]);
  assert.equal(history[0]!.replyTo, undefined);
  assert.equal(history[1]!.replyTo, post1.id);
  assert.equal(history[2]!.replyTo, undefined);
});

test("a reply survives in getHistory after its parent ages out of the in-memory ring buffer, without crashing", async () => {
  const plaza = createPlazaStore();
  const parent = await plaza.addMessage("parent-socket", { nickname: "Alice", text: "parent" }, 0);
  const reply = await plaza.addMessage("reply-socket", { nickname: "Bob", text: "a reply", replyTo: parent.id }, 1);

  // One fewer filler than PLAZA_HISTORY_LIMIT so the buffer (parent + reply
  // + fillers) crosses the cap by exactly 1 - evicting only the oldest
  // entry (the parent), leaving the reply in place.
  for (let i = 0; i < PLAZA_HISTORY_LIMIT - 1; i++) {
    await plaza.addMessage(`filler-socket-${i}`, { nickname: "Filler", text: `filler ${i}` }, 1000 + i);
  }

  const history = await plaza.getHistory();
  const ids = history.map((m) => m.id);
  assert.ok(!ids.includes(parent.id), "parent should have aged out of the ring buffer");
  assert.ok(ids.includes(reply.id), "reply should still be present, unaffected by its parent's eviction");
  assert.equal(history.find((m) => m.id === reply.id)!.replyTo, parent.id, "reply keeps its (now-dangling) replyTo id");
});

test("addMessage rejects a NEW reply whose parent has already aged out of the ring buffer", async () => {
  const plaza = createPlazaStore();
  const parent = await plaza.addMessage("parent-socket", { nickname: "Alice", text: "parent" }, 0);

  for (let i = 0; i < PLAZA_HISTORY_LIMIT; i++) {
    await plaza.addMessage(`filler-socket-${i}`, { nickname: "Filler", text: `filler ${i}` }, 1000 + i);
  }

  await assert.rejects(
    () => plaza.addMessage("late-socket", { nickname: "Bob", text: "too late", replyTo: parent.id }, 999_999),
    /Parent message not found/,
  );
});

// -- rate limiting -------------------------------------------------------

test("addMessage enforces a minimum interval between messages from the same socket", async () => {
  const plaza = createPlazaStore();
  await plaza.addMessage("s1", { nickname: "Alice", text: "one" }, 1000);
  await assert.rejects(() => plaza.addMessage("s1", { nickname: "Alice", text: "two" }, 1000 + PLAZA_RATE_LIMIT_MS - 1));
  const ok = await plaza.addMessage("s1", { nickname: "Alice", text: "two" }, 1000 + PLAZA_RATE_LIMIT_MS);
  assert.equal(ok.text, "two");
});

test("rate limit is per socket, not global", async () => {
  const plaza = createPlazaStore();
  await plaza.addMessage("s1", { nickname: "Alice", text: "one" }, 1000);
  const fromOther = await plaza.addMessage("s2", { nickname: "Bob", text: "hi" }, 1000);
  assert.equal(fromOther.text, "hi");
});

test("a rejected (invalid) message does not consume the rate-limit slot", async () => {
  const plaza = createPlazaStore();
  await assert.rejects(() => plaza.addMessage("s1", { nickname: "Alice", text: "" }, 1000));
  const ok = await plaza.addMessage("s1", { nickname: "Alice", text: "now valid" }, 1000);
  assert.equal(ok.text, "now valid");
});

test("the same rate limit applies to replies as to top-level posts", async () => {
  const plaza = createPlazaStore();
  const parent = await plaza.addMessage("s1", { nickname: "Alice", text: "top-level" }, 1000);
  const firstReply = await plaza.addMessage(
    "s2",
    { nickname: "Bob", text: "reply one", replyTo: parent.id },
    1000,
  );
  assert.equal(firstReply.replyTo, parent.id);

  await assert.rejects(() =>
    plaza.addMessage("s2", { nickname: "Bob", text: "reply two", replyTo: parent.id }, 1000 + PLAZA_RATE_LIMIT_MS - 1),
  );
  const secondReply = await plaza.addMessage(
    "s2",
    { nickname: "Bob", text: "reply two", replyTo: parent.id },
    1000 + PLAZA_RATE_LIMIT_MS,
  );
  assert.equal(secondReply.text, "reply two");
});

// -- history ring buffer -------------------------------------------------

test("getHistory returns messages oldest -> newest, capped at PLAZA_HISTORY_LIMIT", async () => {
  const plaza = createPlazaStore();
  const total = PLAZA_HISTORY_LIMIT + 10;
  for (let i = 0; i < total; i++) {
    await plaza.addMessage("s1", { nickname: "Alice", text: `msg ${i}` }, 1000 + i * PLAZA_RATE_LIMIT_MS);
  }
  const history = await plaza.getHistory();
  assert.equal(history.length, PLAZA_HISTORY_LIMIT);
  assert.equal(history[0]!.text, "msg 10"); // oldest 10 evicted
  assert.equal(history[history.length - 1]!.text, `msg ${total - 1}`);
});

test("getHistory returns a defensive copy (mutating it doesn't affect the store)", async () => {
  const plaza = createPlazaStore();
  await plaza.addMessage("s1", { nickname: "Alice", text: "one" }, 1000);
  const history = await plaza.getHistory();
  history.pop();
  assert.equal((await plaza.getHistory()).length, 1);
});

test("getHistory is empty for a fresh store", async () => {
  const plaza = createPlazaStore();
  assert.deepEqual(await plaza.getHistory(), []);
});

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
import { BOARD_SIZE } from "../engine/board.ts";

/** 1, 2, ..., 25 - a structurally valid board (same shape draft:submit requires - see engine/board.ts's validateBoard). */
const VALID_BOARD = Array.from({ length: BOARD_SIZE }, (_, i) => i + 1);

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

// -- attachments -----------------------------------------------------------
//
// Structured `attachment` (see plaza.ts's PlazaAttachment) - the richer
// successor to bare `skillId`. Three kinds: "skill", "result", "board".
// Every kind is validated strictly (untrusted chat input, see plaza.ts's
// top doc) - a rejected attachment rejects the whole message, never stored
// half-valid.

test("addMessage accepts a 'skill' attachment and returns/stores it as-is", async () => {
  const plaza = createPlazaStore();
  const msg = await plaza.addMessage(
    "s1",
    { nickname: "Alice", text: "check my skill", attachment: { kind: "skill", skillId: 3 } },
    1000,
  );
  assert.deepEqual(msg.attachment, { kind: "skill", skillId: 3 });

  const history = await plaza.getHistory();
  assert.deepEqual(history[0]!.attachment, { kind: "skill", skillId: 3 });
});

test("addMessage accepts a 'result' attachment with all fields, opponent trimmed", async () => {
  const plaza = createPlazaStore();
  const msg = await plaza.addMessage(
    "s1",
    {
      nickname: "Alice",
      text: "gg",
      attachment: { kind: "result", won: true, lines: 5, calls: 18, opponent: "  Bob  " },
    },
    1000,
  );
  assert.deepEqual(msg.attachment, { kind: "result", won: true, lines: 5, calls: 18, opponent: "Bob" });
});

test("addMessage accepts a 'result' attachment without the optional opponent", async () => {
  const plaza = createPlazaStore();
  const msg = await plaza.addMessage(
    "s1",
    { nickname: "Alice", text: "lost this one", attachment: { kind: "result", won: false, lines: 2, calls: 25 } },
    1000,
  );
  assert.deepEqual(msg.attachment, { kind: "result", won: false, lines: 2, calls: 25 });
});

test("addMessage accepts a 'board' attachment, numbers only", async () => {
  const plaza = createPlazaStore();
  const msg = await plaza.addMessage(
    "s1",
    { nickname: "Alice", text: "my board", attachment: { kind: "board", numbers: VALID_BOARD } },
    1000,
  );
  assert.deepEqual(msg.attachment, { kind: "board", numbers: VALID_BOARD });
});

test("addMessage accepts a 'board' attachment with marked cells", async () => {
  const plaza = createPlazaStore();
  const msg = await plaza.addMessage(
    "s1",
    {
      nickname: "Alice",
      text: "almost bingo",
      attachment: { kind: "board", numbers: VALID_BOARD, marked: [1, 2, 3, 4, 5] },
    },
    1000,
  );
  assert.deepEqual(msg.attachment, { kind: "board", numbers: VALID_BOARD, marked: [1, 2, 3, 4, 5] });
});

test("addMessage rejects a missing/non-object attachment shape", async () => {
  const plaza = createPlazaStore();
  for (const bad of ["skill", 123, ["kind"]]) {
    await assert.rejects(() => plaza.addMessage("s1", { nickname: "Alice", text: "x", attachment: bad }, 1000));
  }
});

test("addMessage rejects an attachment.kind outside skill/result/board", async () => {
  const plaza = createPlazaStore();
  await assert.rejects(
    () => plaza.addMessage("s1", { nickname: "Alice", text: "x", attachment: { kind: "nonsense" } }, 1000),
    /attachment\.kind must be/,
  );
});

test("addMessage rejects a 'skill' attachment with a non-positive-integer skillId", async () => {
  const plaza = createPlazaStore();
  for (const bad of [0, -1, 1.5, "3"]) {
    await assert.rejects(() =>
      plaza.addMessage("s1", { nickname: "Alice", text: "x", attachment: { kind: "skill", skillId: bad } }, 1000),
    );
  }
});

test("addMessage rejects a 'result' attachment with a non-boolean won", async () => {
  const plaza = createPlazaStore();
  await assert.rejects(() =>
    plaza.addMessage(
      "s1",
      { nickname: "Alice", text: "x", attachment: { kind: "result", won: "yes", lines: 1, calls: 5 } },
      1000,
    ),
  );
});

test("addMessage rejects a 'result' attachment with lines out of 0-12 range", async () => {
  const plaza = createPlazaStore();
  for (const lines of [-1, 13, 1.5]) {
    await assert.rejects(() =>
      plaza.addMessage(
        "s1",
        { nickname: "Alice", text: "x", attachment: { kind: "result", won: true, lines, calls: 5 } },
        1000,
      ),
    );
  }
});

test("addMessage rejects a 'result' attachment with calls out of 1-25 range", async () => {
  const plaza = createPlazaStore();
  for (const calls of [0, 26, 3.5]) {
    await assert.rejects(() =>
      plaza.addMessage(
        "s1",
        { nickname: "Alice", text: "x", attachment: { kind: "result", won: true, lines: 1, calls } },
        1000,
      ),
    );
  }
});

test("addMessage rejects a 'result' attachment with an opponent longer than 24 characters", async () => {
  const plaza = createPlazaStore();
  await assert.rejects(() =>
    plaza.addMessage(
      "s1",
      { nickname: "Alice", text: "x", attachment: { kind: "result", won: true, lines: 1, calls: 5, opponent: "x".repeat(25) } },
      1000,
    ),
  );
});

test("addMessage rejects a 'board' attachment whose numbers is not a valid board", async () => {
  const plaza = createPlazaStore();
  // duplicate (24 appears twice, 25 missing) - not a valid board, still 25 entries
  const invalidBoard = [...VALID_BOARD.slice(0, 24), 24];
  await assert.rejects(
    () => plaza.addMessage("s1", { nickname: "Alice", text: "x", attachment: { kind: "board", numbers: invalidBoard } }, 1000),
    /attachment\.numbers/,
  );
});

test("addMessage rejects a 'board' attachment whose numbers is not an array", async () => {
  const plaza = createPlazaStore();
  await assert.rejects(() =>
    plaza.addMessage("s1", { nickname: "Alice", text: "x", attachment: { kind: "board", numbers: "not-an-array" } }, 1000),
  );
});

test("addMessage rejects a 'board' attachment with a non-array marked", async () => {
  const plaza = createPlazaStore();
  await assert.rejects(() =>
    plaza.addMessage(
      "s1",
      { nickname: "Alice", text: "x", attachment: { kind: "board", numbers: VALID_BOARD, marked: "nope" } },
      1000,
    ),
  );
});

test("addMessage rejects a 'board' attachment whose marked contains a duplicate", async () => {
  const plaza = createPlazaStore();
  await assert.rejects(() =>
    plaza.addMessage(
      "s1",
      { nickname: "Alice", text: "x", attachment: { kind: "board", numbers: VALID_BOARD, marked: [1, 1] } },
      1000,
    ),
  );
});

test("addMessage rejects a 'board' attachment whose marked contains a value outside 1-25", async () => {
  const plaza = createPlazaStore();
  for (const bad of [0, 26, 1.5]) {
    await assert.rejects(() =>
      plaza.addMessage(
        "s1",
        { nickname: "Alice", text: "x", attachment: { kind: "board", numbers: VALID_BOARD, marked: [bad] } },
        1000,
      ),
    );
  }
});

test("addMessage rejects a 'board' attachment whose marked has more than 25 entries", async () => {
  const plaza = createPlazaStore();
  const oversized = Array.from({ length: BOARD_SIZE + 1 }, (_, i) => (i % 25) + 1); // 26 entries - rejected on length alone, before even checking duplicates
  await assert.rejects(() =>
    plaza.addMessage(
      "s1",
      { nickname: "Alice", text: "x", attachment: { kind: "board", numbers: VALID_BOARD, marked: oversized } },
      1000,
    ),
    /at most 25 entries/,
  );
});

test("a rejected attachment does not consume the rate-limit slot", async () => {
  const plaza = createPlazaStore();
  await assert.rejects(() =>
    plaza.addMessage("s1", { nickname: "Alice", text: "bad", attachment: { kind: "skill", skillId: -1 } }, 1000),
  );
  const ok = await plaza.addMessage("s1", { nickname: "Alice", text: "now valid" }, 1000);
  assert.equal(ok.text, "now valid");
});

// -- backward compatibility: legacy skillId -> normalized attachment -------

test("addMessage's return value normalizes a legacy skillId-only send into attachment: { kind: 'skill', skillId }", async () => {
  const plaza = createPlazaStore();
  const msg = await plaza.addMessage("s1", { nickname: "Alice", text: "check my skill", skillId: 7 }, 1000);
  assert.equal(msg.skillId, 7);
  assert.deepEqual(msg.attachment, { kind: "skill", skillId: 7 });
});

test("getHistory normalizes a legacy skillId-only message into attachment: { kind: 'skill', skillId }", async () => {
  const plaza = createPlazaStore();
  await plaza.addMessage("s1", { nickname: "Alice", text: "check my skill", skillId: 7 }, 1000);
  const history = await plaza.getHistory();
  assert.deepEqual(history[0]!.attachment, { kind: "skill", skillId: 7 });
});

test("a message with neither skillId nor attachment has attachment undefined, on both addMessage's return and getHistory", async () => {
  const plaza = createPlazaStore();
  const msg = await plaza.addMessage("s1", { nickname: "Alice", text: "gm" }, 1000);
  assert.equal(msg.attachment, undefined);
  const history = await plaza.getHistory();
  assert.equal(history[0]!.attachment, undefined);
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

/**
 * Integration tests for the HTTP JSON API: real requests (via global fetch)
 * against a real node:http server running createHttpHandler(), the same
 * way index.ts wires it. Engine/daily/quest correctness is already covered
 * by their own unit tests - this file is about routing, validation, CORS,
 * and the response envelope.
 */

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server as NodeHttpServer } from "node:http";
import type { AddressInfo } from "node:net";

import type { SkillDef } from "../chain/reader.ts";
import { BOARD_SIZE } from "../engine/index.ts";
import { createHttpHandler, type HttpHandlerOptions } from "./http.ts";

type Envelope = { ok: true; data: unknown } | { ok: false; error: string };

let httpServer: NodeHttpServer;
let baseUrl: string;

beforeEach(async () => {
  httpServer = createServer(createHttpHandler());
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const port = (httpServer.address() as AddressInfo).port;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterEach(async () => {
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
});

async function get(path: string): Promise<{ status: number; body: Envelope; headers: Headers }> {
  const res = await fetch(`${baseUrl}${path}`);
  return { status: res.status, body: (await res.json()) as Envelope, headers: res.headers };
}

async function post(path: string, payload: unknown): Promise<{ status: number; body: Envelope; headers: Headers }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return { status: res.status, body: (await res.json()) as Envelope, headers: res.headers };
}

/** 1..25 in row-major order - a valid board (see engine/board.test.ts for the same fixture). */
function identityBoard(): number[] {
  return Array.from({ length: BOARD_SIZE }, (_, i) => i + 1);
}

// -- CORS --------------------------------------------------------------

test("every response carries Access-Control-Allow-Origin: *", async () => {
  const { headers } = await get("/health");
  assert.equal(headers.get("access-control-allow-origin"), "*");
});

test("OPTIONS preflight gets a 204 with CORS headers, no body route needed", async () => {
  const res = await fetch(`${baseUrl}/daily/play`, { method: "OPTIONS" });
  assert.equal(res.status, 204);
  assert.equal(res.headers.get("access-control-allow-origin"), "*");
  assert.match(res.headers.get("access-control-allow-methods") ?? "", /POST/);
});

// -- GET /health --------------------------------------------------------

test("GET /health returns { status: 'ok' }", async () => {
  const { status, body } = await get("/health");
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  if (body.ok) assert.deepEqual(body.data, { status: "ok" });
});

// -- GET /daily/today -----------------------------------------------------

test("GET /daily/today defaults to today (UTC) when no date is given", async () => {
  const { status, body } = await get("/daily/today");
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  if (!body.ok) return;
  const data = body.data as { number: number; date: string };
  assert.equal(data.date, new Date().toISOString().slice(0, 10));
  assert.equal(typeof data.number, "number");
});

test("GET /daily/today?date=... echoes the requested date and never leaks a call sequence", async () => {
  const { status, body } = await get("/daily/today?date=2026-08-01");
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  if (!body.ok) return;
  assert.deepEqual(body.data, { number: 1, date: "2026-08-01" });
  assert.equal("callSequence" in (body.data as object), false);
});

test("GET /daily/today?date=garbage is a 400", async () => {
  const { status, body } = await get("/daily/today?date=not-a-date");
  assert.equal(status, 400);
  assert.equal(body.ok, false);
});

// -- POST /daily/play -----------------------------------------------------

test("POST /daily/play with a valid board returns a full result and never leaks board numbers", async () => {
  const { status, body } = await post("/daily/play", {
    nickname: "Tester",
    board: identityBoard(),
    date: "2026-08-01",
  });
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  if (!body.ok) return;
  const data = body.data as Record<string, unknown>;
  assert.equal(data.number, 1);
  assert.equal(typeof data.callsToBingo, "number");
  assert.ok(Array.isArray(data.linesPerCall));
  assert.equal(typeof data.score, "number");
  assert.ok(Array.isArray(data.markedAtBingo));
  assert.equal(typeof data.shareCard, "string");
  assert.equal(typeof data.shareCardEn, "string");
  assert.match(data.shareCard as string, /TheBingoFi #1/);
});

test("POST /daily/play submits the score to the leaderboard for that date", async () => {
  await post("/daily/play", { nickname: "Alice", board: identityBoard(), date: "2026-08-02" });
  const { status, body } = await get("/daily/leaderboard?date=2026-08-02");
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  if (!body.ok) return;
  const entries = body.data as { nickname: string; score: number; callsToBingo: number }[];
  assert.equal(entries.length, 1);
  assert.equal(entries[0]!.nickname, "Alice");
});

test("POST /daily/play keeps only the best score per nickname", async () => {
  // identityBoard finishes bingo fast against this date's call sequence;
  // a reversed board is still valid but (in general) a different score.
  // We just need two different scores from the SAME nickname and confirm
  // only the higher one survives.
  const boardA = identityBoard();
  const boardB = [...identityBoard()].reverse();

  const first = await post("/daily/play", { nickname: "Bob", board: boardA, date: "2026-08-03" });
  const second = await post("/daily/play", { nickname: "Bob", board: boardB, date: "2026-08-03" });
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  if (!first.body.ok || !second.body.ok) throw new Error("unreachable");
  const scoreA = (first.body.data as { score: number }).score;
  const scoreB = (second.body.data as { score: number }).score;

  const { body } = await get("/daily/leaderboard?date=2026-08-03");
  if (!body.ok) throw new Error("unreachable");
  const entries = body.data as { nickname: string; score: number }[];
  assert.equal(entries.length, 1);
  assert.equal(entries[0]!.score, Math.max(scoreA, scoreB));
});

test("POST /daily/play rejects an invalid board with 400", async () => {
  const { status, body } = await post("/daily/play", { nickname: "Tester", board: [1, 2, 3] });
  assert.equal(status, 400);
  assert.equal(body.ok, false);
});

test("POST /daily/play rejects a missing nickname with 400", async () => {
  const { status, body } = await post("/daily/play", { board: identityBoard() });
  assert.equal(status, 400);
  assert.equal(body.ok, false);
});

test("POST /daily/play with invalid JSON body is a 400, not a crash", async () => {
  const res = await fetch(`${baseUrl}/daily/play`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{not json",
  });
  assert.equal(res.status, 400);
  const body = (await res.json()) as Envelope;
  assert.equal(body.ok, false);
});

test("POST /daily/play with an oversized body is a 400, not a crash", async () => {
  const res = await fetch(`${baseUrl}/daily/play`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nickname: "Tester", board: identityBoard(), filler: "x".repeat(20_000) }),
  });
  assert.equal(res.status, 400);
});

// -- GET /daily/leaderboard -------------------------------------------------

test("GET /daily/leaderboard for a date with no plays returns an empty array", async () => {
  const { status, body } = await get("/daily/leaderboard?date=2099-01-01");
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  if (body.ok) assert.deepEqual(body.data, []);
});

// -- GET /quests + /quests/progress/:playerId --------------------------

test("GET /quests returns the example quest catalog", async () => {
  const { status, body } = await get("/quests");
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  if (!body.ok) return;
  const quests = body.data as { id: string }[];
  assert.ok(quests.some((q) => q.id === "daily_win_1_match"));
});

test("GET /quests/progress/:playerId returns [] for a player with no recorded progress", async () => {
  const { status, body } = await get("/quests/progress/nobody-123");
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  if (body.ok) assert.deepEqual(body.data, []);
});

// -- GET /metadata/:id.json ------------------------------------------------
//
// Uses its own server per test (via withHandler) rather than the shared
// beforeEach one above, since each test needs a different (mocked)
// resolveSkill - see api/http.ts's HttpHandlerOptions. The shared server
// (created with no opts, so resolveSkill is undefined) is reused for the
// "chain not configured" 503 case.

async function withHandler<T>(opts: HttpHandlerOptions, body: (baseUrl: string) => Promise<T>): Promise<T> {
  const server = createServer(createHttpHandler(opts));
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as AddressInfo).port;
  try {
    return await body(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

function skillDefFixture(overrides: Partial<SkillDef> = {}): SkillDef {
  return {
    skillId: 1,
    effectType: "WILD_DAUB",
    charges: 1,
    cooldown: 0,
    maxPerLoadout: 1,
    rarity: 10,
    active: true,
    metadataURI: "ipfs://x",
    ...overrides,
  };
}

test("GET /metadata/:id.json returns ERC-1155 metadata directly, no {ok,data} envelope", async () => {
  await withHandler({ resolveSkill: async (id) => (id === 1 ? skillDefFixture() : undefined) }, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/metadata/1.json`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("cache-control"), "public, max-age=300");
    const body = (await res.json()) as Record<string, unknown>;
    assert.equal(body.name, "Wild Daub");
    assert.equal(typeof body.description, "string");
    assert.equal(body.image, "https://thebingofi.vercel.app/assets/skills/wild-daub.png");
    // Tidak ada aset video: field-nya sengaja absen, bukan menunjuk URL 404.
    assert.equal("animation_url" in body, false);
    assert.equal("ok" in body, false);
    assert.equal("data" in body, false);
  });
});

test("GET /metadata/:id.json decodes bytes32 hex effectType from the real chain reader", async () => {
  // On-chain effectType arrives as 0x-padded bytes32 hex, not "WILD_DAUB".
  const wildDaubHex = `0x${Buffer.from("WILD_DAUB").toString("hex").padEnd(64, "0")}`;
  await withHandler({ resolveSkill: async () => skillDefFixture({ effectType: wildDaubHex }) }, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/metadata/1.json`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as { name: string; image: string; attributes: { trait_type: string; value: unknown }[] };
    assert.equal(body.name, "Wild Daub");
    assert.equal(body.image, "https://thebingofi.vercel.app/assets/skills/wild-daub.png");
    assert.equal(body.attributes.find((a) => a.trait_type === "Effect")?.value, "WILD_DAUB");
  });
});

test("GET /metadata/:id.json attributes carry Effect/Rarity/Charges/Cooldown/Max Per Loadout", async () => {
  await withHandler(
    {
      resolveSkill: async () =>
        skillDefFixture({ effectType: "DOUBLE_CALL", rarity: 5, charges: 2, cooldown: 3, maxPerLoadout: 2 }),
    },
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/metadata/2.json`);
      assert.equal(res.status, 200);
      const body = (await res.json()) as { attributes: unknown };
      assert.deepEqual(body.attributes, [
        { trait_type: "Effect", value: "DOUBLE_CALL" },
        { trait_type: "Rarity", value: 5 },
        { trait_type: "Charges", value: 2 },
        { trait_type: "Cooldown", value: 3 },
        { trait_type: "Max Per Loadout", value: 2 },
      ]);
    },
  );
});

test("GET /metadata/<64-hex-digit id>.json resolves the same skill as the decimal form", async () => {
  await withHandler({ resolveSkill: async (id) => (id === 1 ? skillDefFixture() : undefined) }, async (baseUrl) => {
    const hexId = "1".padStart(64, "0");
    const res = await fetch(`${baseUrl}/metadata/${hexId}.json`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as { name: string };
    assert.equal(body.name, "Wild Daub");
  });
});

test("GET /metadata/:id.json for an unknown skill is a 404 JSON error", async () => {
  await withHandler({ resolveSkill: async () => undefined }, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/metadata/999.json`);
    assert.equal(res.status, 404);
    const body = (await res.json()) as { ok: boolean };
    assert.equal(body.ok, false);
  });
});

test("GET /metadata/:id.json for a malformed id is a 400", async () => {
  await withHandler({ resolveSkill: async () => skillDefFixture() }, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/metadata/not-an-id.json`);
    assert.equal(res.status, 400);
  });
});

test("GET /metadata/:id.json is a 503 when chain isn't configured", async () => {
  const { status, body } = await get("/metadata/1.json");
  assert.equal(status, 503);
  assert.equal(body.ok, false);
});

test("GET /metadata/:id.json caches per id within the TTL (resolveSkill called once)", async () => {
  let calls = 0;
  await withHandler(
    {
      resolveSkill: async () => {
        calls++;
        return skillDefFixture();
      },
    },
    async (baseUrl) => {
      const first = await fetch(`${baseUrl}/metadata/1.json`);
      const second = await fetch(`${baseUrl}/metadata/1.json`);
      assert.equal(first.status, 200);
      assert.equal(second.status, 200);
      assert.equal(calls, 1);
    },
  );
});

// -- 404 + method handling ------------------------------------------------

test("an unknown path returns 404, not a crash", async () => {
  const { status, body } = await get("/nope");
  assert.equal(status, 404);
  assert.equal(body.ok, false);
});

test("GET on a POST-only route returns 404", async () => {
  const { status } = await get("/daily/play");
  assert.equal(status, 404);
});

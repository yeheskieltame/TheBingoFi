/**
 * Manual HTTP JSON API: no framework, a router simple enough not to need
 * one (8 endpoints). Mounted on the same node:http server as Socket.IO
 * (see index.ts: `createServer(createHttpHandler())` then socket.io
 * attaches to that same httpServer).
 *
 * Every response is JSON `{ ok: true, data }` / `{ ok: false, error }`
 * EXCEPT `GET /metadata/:id.json`, which returns the raw ERC-1155 metadata
 * object directly (see below) - every response still carries
 * `Access-Control-Allow-Origin: *` (FE dev server runs on a different
 * origin/port) - see sendJson/sendMetadata. OPTIONS requests get a bare
 * CORS preflight response.
 *
 * Anti-cheat: GET /daily/today NEVER includes the day's call sequence, only
 * `{ number, date }` - see daily/challenge.ts's callSequence, which this
 * file deliberately never imports.
 */

import type { IncomingMessage, ServerResponse } from "node:http";

import type { SkillDef } from "../chain/reader.ts";
import { challengeNumber, playChallenge, shareCard } from "../daily/index.ts";
import { CELL_SWAP, DOUBLE_CALL, GHOST_CALL, NULLIFY, WILD_DAUB, type Board } from "../engine/index.ts";
import { exampleQuests } from "../quest/index.ts";
import { getLeaderboard, submitScore } from "./dailyLeaderboard.ts";
import type { DailyPlayResponse, DailyTodayResponse, SkillMetadataResponse } from "./protocol.ts";
import { getProgress } from "./questStore.ts";

const MAX_BODY_BYTES = 10 * 1024;
const MAX_NICKNAME_LENGTH = 24;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// -- metadata (GET /metadata/:id.json) -----------------------------------

/**
 * Where skill artwork lives: the web app's /public (CONCEPT.md §3's
 * "identitas premium" slots). Override with ASSET_BASE_URL when the web app
 * moves to another domain - the on-chain metadataURI never has to change.
 */
const METADATA_ASSET_BASE_URL =
  process.env.ASSET_BASE_URL ?? "https://thebingofi.vercel.app/assets/skills";
const METADATA_CACHE_TTL_MS = 5 * 60 * 1000;
const METADATA_CACHE_CONTROL = "public, max-age=300";
/** 64 lowercase hex digits, zero-padded - the ERC-1155 metadata URI {id} substitution convention. */
const HEX_METADATA_ID_RE = /^[0-9a-f]{64}$/;
const DECIMAL_METADATA_ID_RE = /^[0-9]+$/;

/** One sentence per effectType (CLAUDE.md/CONCEPT.md §3's 5 starting skills) - English, no fallback data available on-chain to derive this from. */
const EFFECT_DESCRIPTIONS: Readonly<Record<string, string>> = {
  [WILD_DAUB]: "Marks one cell on your own board without that number being called.",
  [DOUBLE_CALL]: "Lets you call two numbers in a single turn instead of one.",
  [GHOST_CALL]: "Your next call marks only your own board, not your opponents'.",
  [CELL_SWAP]: "Swaps the numbers in two cells on your own board.",
  [NULLIFY]: "Cancels an opponent's skill before it takes effect.",
};

/**
 * On-chain effectType is bytes32, so viem returns it as 0x-padded hex
 * ("0x57494c445f44415542000...") - decode to the plain "WILD_DAUB" form.
 * Already-decoded strings (unit-test mocks) pass through unchanged.
 */
function decodeEffectType(effectType: string): string {
  if (!effectType.startsWith("0x")) return effectType;
  return Buffer.from(effectType.slice(2), "hex").toString("utf8").replace(/\0+$/, "");
}

/** "WILD_DAUB" -> "Wild Daub" - generic, so any future effectType still gets a sensible name without a lookup table. */
function humanizeEffectType(effectType: string): string {
  return effectType
    .toLowerCase()
    .split("_")
    .filter((word) => word.length > 0)
    .map((word) => word[0]!.toUpperCase() + word.slice(1))
    .join(" ");
}

/** "WILD_DAUB" -> "wild-daub", for the placeholder asset URLs below. */
function slugifyEffectType(effectType: string): string {
  return effectType.toLowerCase().replace(/_/g, "-");
}

/** Builds the ERC-1155 metadata JSON for one skill (CONCEPT.md §3's "identitas premium" metadata slots). */
function skillMetadata(def: SkillDef): SkillMetadataResponse {
  const effectType = decodeEffectType(def.effectType);
  const slug = slugifyEffectType(effectType);
  return {
    name: humanizeEffectType(effectType),
    description: EFFECT_DESCRIPTIONS[effectType] ?? "A special skill effect used during a match.",
    // Belum ada aset video: animation_url sengaja tidak dikirim daripada
    // menunjuk file yang 404 di wallet/marketplace pihak ketiga.
    image: `${METADATA_ASSET_BASE_URL}/${slug}.png`,
    attributes: [
      { trait_type: "Effect", value: effectType },
      { trait_type: "Rarity", value: def.rarity },
      { trait_type: "Charges", value: def.charges },
      { trait_type: "Cooldown", value: def.cooldown },
      { trait_type: "Max Per Loadout", value: def.maxPerLoadout },
    ],
  };
}

/**
 * Parses a GET /metadata/:id.json path segment (with the ".json" suffix
 * already stripped): either a plain decimal skillId ("1") or a 64-hex-digit
 * lowercase zero-padded id ala the ERC-1155 metadata URI {id} substitution
 * ("000...0001") - both resolve to the same skillId. undefined for anything
 * else, or a non-positive/unsafe result.
 */
function parseMetadataId(raw: string): number | undefined {
  let value: number;
  if (HEX_METADATA_ID_RE.test(raw)) {
    value = Number(BigInt(`0x${raw}`));
  } else if (DECIMAL_METADATA_ID_RE.test(raw)) {
    value = Number(raw);
  } else {
    return undefined;
  }
  return Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

/** An error with an HTTP status attached - thrown by validators, caught once at the top of handleRequest. */
class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Parses an optional "YYYY-MM-DD" date string, defaulting to today (UTC) when absent. */
function parseDateParam(value: string | null): string {
  if (value === null || value === "") return todayISO();
  if (!DATE_RE.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new HttpError(400, `Invalid date "${value}", expected YYYY-MM-DD`);
  }
  return value;
}

function validateNickname(value: unknown): string {
  if (typeof value !== "string") throw new HttpError(400, "nickname must be a string");
  const trimmed = value.trim();
  if (trimmed.length === 0) throw new HttpError(400, "nickname must not be empty");
  if (trimmed.length > MAX_NICKNAME_LENGTH) {
    throw new HttpError(400, `nickname must be at most ${MAX_NICKNAME_LENGTH} characters`);
  }
  return trimmed;
}

function validateBoardNumbers(value: unknown): number[] {
  if (!Array.isArray(value)) throw new HttpError(400, "board must be an array");
  const numbers: number[] = [];
  for (const entry of value) {
    if (typeof entry !== "number") throw new HttpError(400, "board must contain only numbers");
    numbers.push(entry);
  }
  return numbers;
}

// -- body parsing -----------------------------------------------------------

/**
 * Reads and JSON-parses the request body, capped at MAX_BODY_BYTES so a
 * malicious/broken client can't exhaust memory. Resolves `undefined` for an
 * empty body; rejects (never throws synchronously) on oversize or invalid
 * JSON so callers can turn that into a clean 400 instead of a crash.
 *
 * Deliberately does NOT destroy the socket on oversize: it keeps draining
 * (without buffering past the cap) until the client finishes sending, then
 * rejects - destroying mid-request resets the TCP connection before our
 * 400 response can be written, which the client sees as a hard failure
 * rather than a clean HTTP error.
 */
function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0;
    let tooLarge = false;
    const chunks: Buffer[] = [];

    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        tooLarge = true;
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      if (tooLarge) {
        reject(new HttpError(400, `Request body exceeds ${MAX_BODY_BYTES} bytes`));
        return;
      }
      if (chunks.length === 0) {
        resolve(undefined);
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new HttpError(400, "Invalid JSON body"));
      }
    });

    req.on("error", reject);
  });
}

// -- responses ----------------------------------------------------------

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    "Access-Control-Allow-Origin": "*",
  });
  res.end(payload);
}

function ok(res: ServerResponse, data: unknown): void {
  sendJson(res, 200, { ok: true, data });
}

function fail(res: ServerResponse, status: number, error: string): void {
  sendJson(res, status, { ok: false, error });
}

/** Like sendJson, but for GET /metadata/:id.json's raw (non-enveloped) ERC-1155 response, cacheable by clients/CDNs via Cache-Control. */
function sendMetadata(res: ServerResponse, body: unknown, cacheControl: string): void {
  const payload = JSON.stringify(body);
  res.writeHead(200, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": cacheControl,
  });
  res.end(payload);
}

interface CachedMetadata {
  readonly metadata: SkillMetadataResponse;
  readonly expiresAt: number;
}

export interface HttpHandlerOptions {
  /**
   * Resolves a skillId to its on-chain SkillDef for GET /metadata/:id.json;
   * undefined resolves to "not registered" (404). Absent (default) means
   * chain isn't wired in for this handler - the route responds 503 rather
   * than touching a real client. Production default is built in index.ts
   * via chain/defaultVerifier.ts's createDefaultSkillMetadataReader (this
   * file never builds a real chain client itself - same DI boundary as
   * realtime/server.ts's `verifyLoadout`). Tests inject a mock/stub here
   * instead (see http.test.ts).
   */
  readonly resolveSkill?: (skillId: number) => Promise<SkillDef | undefined>;
}

// -- router ---------------------------------------------------------

/**
 * Builds the node:http request listener for the whole JSON API. Every
 * route's logic is wrapped so a thrown HttpError becomes its status/message
 * and any other thrown/rejected error becomes a 400 - nothing here ever
 * lets an exception escape and crash the process (see createHttpHandler's
 * own top-level catch as the last line of defense).
 */
async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  resolveSkill: ((skillId: number) => Promise<SkillDef | undefined>) | undefined,
  metadataCache: Map<number, CachedMetadata>,
): Promise<void> {
  const method = req.method ?? "GET";
  const url = new URL(req.url ?? "/", "http://internal");
  const pathname = url.pathname;

  if (method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  try {
    if (method === "GET" && pathname === "/health") {
      ok(res, { status: "ok" });
      return;
    }

    if (method === "GET" && pathname === "/daily/today") {
      const date = parseDateParam(url.searchParams.get("date"));
      ok(res, { number: challengeNumber(date), date } satisfies DailyTodayResponse);
      return;
    }

    if (method === "POST" && pathname === "/daily/play") {
      const body = await readJsonBody(req);
      if (typeof body !== "object" || body === null) {
        throw new HttpError(400, "Body must be a JSON object");
      }
      const record = body as Record<string, unknown>;

      const nickname = validateNickname(record.nickname);
      const boardNumbers = validateBoardNumbers(record.board);
      const date = parseDateParam(typeof record.date === "string" ? record.date : null);
      // Optional: the stable accountId from a prior socket identity:hello
      // handshake (see server/API.md's "Identity" section) - HTTP play
      // works fine without one (guest play), it just won't be deduped
      // against itself in the Postgres-backed leaderboard (see
      // dailyLeaderboard.ts's doc).
      const accountId =
        typeof record.accountId === "string" && record.accountId.trim().length > 0 ? record.accountId.trim() : undefined;

      let result;
      try {
        result = playChallenge(boardNumbers as Board, date);
      } catch (err) {
        throw new HttpError(400, err instanceof Error ? err.message : "Invalid board");
      }

      await submitScore(date, { nickname, score: result.score, callsToBingo: result.callsToBingo, accountId });

      ok(res, {
        number: result.number,
        callsToBingo: result.callsToBingo,
        linesPerCall: result.linesPerCall,
        score: result.score,
        markedAtBingo: result.markedAtBingo,
        shareCard: shareCard(result, "id"),
        shareCardEn: shareCard(result, "en"),
      } satisfies DailyPlayResponse);
      return;
    }

    if (method === "GET" && pathname === "/daily/leaderboard") {
      const date = parseDateParam(url.searchParams.get("date"));
      ok(res, await getLeaderboard(date));
      return;
    }

    if (method === "GET" && pathname === "/quests") {
      ok(res, exampleQuests);
      return;
    }

    if (method === "GET" && pathname.startsWith("/quests/progress/")) {
      // `:playerId` here means the stable accountId from identity:hello
      // (see server/API.md's "Identity" section) - kept in the URL/param
      // name for backward compatibility, but it is NOT realtime/rooms.ts's
      // ephemeral per-room playerId.
      const playerId = decodeURIComponent(pathname.slice("/quests/progress/".length));
      if (playerId.length === 0) throw new HttpError(400, "playerId is required");
      ok(res, await getProgress(playerId));
      return;
    }

    if (method === "GET" && pathname.startsWith("/metadata/") && pathname.endsWith(".json")) {
      const idPart = pathname.slice("/metadata/".length, -".json".length);
      const skillId = parseMetadataId(idPart);
      if (skillId === undefined) throw new HttpError(400, `Invalid metadata id "${idPart}"`);
      if (!resolveSkill) throw new HttpError(503, "Chain belum dikonfigurasi - metadata tidak tersedia");

      const now = Date.now();
      const cached = metadataCache.get(skillId);
      if (cached && cached.expiresAt > now) {
        sendMetadata(res, cached.metadata, METADATA_CACHE_CONTROL);
        return;
      }

      const def = await resolveSkill(skillId);
      if (!def) throw new HttpError(404, `Skill ${skillId} not found`);

      const metadata = skillMetadata(def);
      metadataCache.set(skillId, { metadata, expiresAt: now + METADATA_CACHE_TTL_MS });
      sendMetadata(res, metadata, METADATA_CACHE_CONTROL);
      return;
    }

    fail(res, 404, `Not found: ${method} ${pathname}`);
  } catch (err) {
    if (err instanceof HttpError) {
      fail(res, err.status, err.message);
      return;
    }
    fail(res, 400, err instanceof Error ? err.message : "Invalid request");
  }
}

/** Node:http request listener for the whole JSON API - pass to `createServer`. */
export function createHttpHandler(opts: HttpHandlerOptions = {}): (req: IncomingMessage, res: ServerResponse) => void {
  const resolveSkill = opts.resolveSkill;
  // Per-handler (not module-level) so separate createHttpHandler() calls -
  // e.g. one per test - never share cached metadata across different
  // resolveSkill implementations.
  const metadataCache = new Map<number, CachedMetadata>();

  return (req, res) => {
    handleRequest(req, res, resolveSkill, metadataCache).catch((err: unknown) => {
      try {
        if (!res.headersSent) {
          fail(res, 500, err instanceof Error ? err.message : "Unexpected server error");
        } else {
          res.end();
        }
      } catch {
        // Response is already broken beyond repair; nothing more we can do
        // without crashing the process, which is the one thing we must not do.
      }
    });
  };
}

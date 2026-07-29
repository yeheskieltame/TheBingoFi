/**
 * Manual HTTP JSON API: no framework, a router simple enough not to need
 * one (7 endpoints). Mounted on the same node:http server as Socket.IO
 * (see index.ts: `createServer(createHttpHandler())` then socket.io
 * attaches to that same httpServer).
 *
 * Every response is JSON `{ ok: true, data }` / `{ ok: false, error }`, and
 * every response carries `Access-Control-Allow-Origin: *` (FE dev server
 * runs on a different origin/port) - see sendJson. OPTIONS requests get a
 * bare CORS preflight response.
 *
 * Anti-cheat: GET /daily/today NEVER includes the day's call sequence, only
 * `{ number, date }` - see daily/challenge.ts's callSequence, which this
 * file deliberately never imports.
 */

import type { IncomingMessage, ServerResponse } from "node:http";

import { challengeNumber, playChallenge, shareCard } from "../daily/index.ts";
import type { Board } from "../engine/index.ts";
import { exampleQuests } from "../quest/index.ts";
import { getLeaderboard, submitScore } from "./dailyLeaderboard.ts";
import type { DailyPlayResponse, DailyTodayResponse } from "./protocol.ts";
import { getProgress } from "./questStore.ts";

const MAX_BODY_BYTES = 10 * 1024;
const MAX_NICKNAME_LENGTH = 24;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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

// -- router ---------------------------------------------------------

/**
 * Builds the node:http request listener for the whole JSON API. Every
 * route's logic is wrapped so a thrown HttpError becomes its status/message
 * and any other thrown/rejected error becomes a 400 - nothing here ever
 * lets an exception escape and crash the process (see createHttpHandler's
 * own top-level catch as the last line of defense).
 */
async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
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

      let result;
      try {
        result = playChallenge(boardNumbers as Board, date);
      } catch (err) {
        throw new HttpError(400, err instanceof Error ? err.message : "Invalid board");
      }

      submitScore(date, { nickname, score: result.score, callsToBingo: result.callsToBingo });

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
      ok(res, getLeaderboard(date));
      return;
    }

    if (method === "GET" && pathname === "/quests") {
      ok(res, exampleQuests);
      return;
    }

    if (method === "GET" && pathname.startsWith("/quests/progress/")) {
      const playerId = decodeURIComponent(pathname.slice("/quests/progress/".length));
      if (playerId.length === 0) throw new HttpError(400, "playerId is required");
      ok(res, getProgress(playerId));
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
export function createHttpHandler(): (req: IncomingMessage, res: ServerResponse) => void {
  return (req, res) => {
    handleRequest(req, res).catch((err: unknown) => {
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

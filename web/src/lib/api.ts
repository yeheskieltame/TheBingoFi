/**
 * Typed HTTP client for @thebingofi/server's JSON API (server/API.md
 * section 2). Every endpoint here is HTTP-only (daily challenge, quests) -
 * the realtime room/match flow lives in socket.ts + hooks/useRoom.ts
 * instead.
 *
 * All response shapes are imported from "@thebingofi/server/protocol" -
 * the same contract module the server compiles against - so FE and server
 * cannot drift silently.
 */

import type {
  ApiEnvelope,
  DailyLeaderboardResponse,
  DailyPlayResponse,
  DailyTodayResponse,
  LeaderboardEntry,
  QuestDef,
  QuestProgress,
} from "@thebingofi/server/protocol";

export type ApiResult<T> = ApiEnvelope<T>;
export type { DailyPlayResponse, DailyTodayResponse, LeaderboardEntry, QuestDef, QuestProgress };

// Alias lama yang sudah dipakai komponen/hooks — tetap diekspor supaya
// konsumen cukup kenal satu nama per konsep.
export type DailyToday = DailyTodayResponse;
export type DailyPlayResult = DailyPlayResponse;
export type DailyLeaderboardEntry = LeaderboardEntry;

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3001";

async function request<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  try {
    const res = await fetch(`${SERVER_URL}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
    const body = (await res.json()) as ApiResult<T>;
    return body;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Network error" };
  }
}

// -- GET /daily/today ---------------------------------------------------

export function getDailyToday(date?: string): Promise<ApiResult<DailyTodayResponse>> {
  const qs = date ? `?date=${encodeURIComponent(date)}` : "";
  return request<DailyTodayResponse>(`/daily/today${qs}`);
}

// -- POST /daily/play ----------------------------------------------------

export interface DailyPlayPayload {
  readonly nickname: string;
  readonly board: readonly number[];
  readonly date?: string;
}

export function postDailyPlay(payload: DailyPlayPayload): Promise<ApiResult<DailyPlayResponse>> {
  return request<DailyPlayResponse>("/daily/play", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// -- GET /daily/leaderboard ----------------------------------------------

export function getDailyLeaderboard(date?: string): Promise<ApiResult<DailyLeaderboardResponse>> {
  const qs = date ? `?date=${encodeURIComponent(date)}` : "";
  return request<DailyLeaderboardResponse>(`/daily/leaderboard${qs}`);
}

// -- GET /quests -----------------------------------------------------

export function getQuests(): Promise<ApiResult<readonly QuestDef[]>> {
  return request<readonly QuestDef[]>("/quests");
}

// -- GET /quests/progress/:playerId -----------------------------------

export function getQuestProgress(playerId: string): Promise<ApiResult<readonly QuestProgress[]>> {
  return request<readonly QuestProgress[]>(`/quests/progress/${encodeURIComponent(playerId)}`);
}

/**
 * Typed Socket.IO contract shared between the server and any frontend
 * client (Next.js + socket.io-client, see server/package.json's
 * `"./protocol"` export -> `import type { ... } from
 * "@thebingofi/server/protocol"`). This is the ONE place the wire shape of
 * every realtime event is declared - realtime/server.ts is instantiated as
 * `new Server<ClientToServerEvents, ServerToClientEvents>(...)`, so any
 * drift between what the handlers actually send/expect and what's declared
 * here becomes a compile error there, not a runtime surprise for FE.
 *
 * Every client->server event uses the ack-callback pattern: the server
 * always calls back with a definite `{ ok: true, ...data } | { ok: false,
 * error }` instead of the client having to infer success from side effects
 * (see realtime/server.ts's safeHandler).
 *
 * View/payload shapes (LobbyView, MatchView, ...) are re-exported from
 * realtime/views.ts - the ONE place that decides what's safe to send to a
 * client (no opponent boards, no unrevealed daily-challenge call sequence)
 * - and are never redefined here, so there's a single source of truth.
 */

import type { LobbyView, MatchView } from "../realtime/views.ts";

export type {
  LobbyPlayerView,
  LobbyView,
  MatchPlayerPublicView,
  MatchView,
} from "../realtime/views.ts";

/**
 * Every client->server event acks with this shape: a definite
 * success-with-data or failure-with-reason, never silence.
 */
export type Ack<T> = (
  response: ({ readonly ok: true } & T) | { readonly ok: false; readonly error: string },
) => void;

/** Ack success payload carrying no extra fields (e.g. room:leave). */
export type EmptyAckData = Record<never, never>;

// -- client -> server payloads ---------------------------------------------

export interface RoomCreatePayload {
  readonly nickname: string;
}

export interface RoomJoinPayload {
  readonly code: string;
  readonly nickname: string;
}

export interface DraftSubmitPayload {
  readonly numbers: readonly number[];
}

export interface MatchCallPayload {
  readonly number: number;
}

// -- client -> server ack data ----------------------------------------------

export interface RoomJoinedAckData {
  readonly code: string;
  readonly playerId: string;
  readonly view: LobbyView;
}

export interface LobbyAckData {
  readonly view: LobbyView;
}

export interface MatchCallAckData {
  readonly view: MatchView;
}

export interface ClientToServerEvents {
  "room:create": (payload: RoomCreatePayload, ack: Ack<RoomJoinedAckData>) => void;
  "room:join": (payload: RoomJoinPayload, ack: Ack<RoomJoinedAckData>) => void;
  "room:leave": (payload: EmptyAckData, ack: Ack<EmptyAckData>) => void;
  "draft:start": (payload: EmptyAckData, ack: Ack<LobbyAckData>) => void;
  "draft:submit": (payload: DraftSubmitPayload, ack: Ack<LobbyAckData>) => void;
  "match:call": (payload: MatchCallPayload, ack: Ack<MatchCallAckData>) => void;
}

// -- server -> client events -------------------------------------------------

export interface MatchEndedPayload {
  readonly winnerId: string | null;
  readonly reason?: string;
}

export interface QuestCompletedPayload {
  readonly questId: string;
  readonly title: string;
}

export interface ServerToClientEvents {
  "room:state": (view: LobbyView) => void;
  "match:state": (view: MatchView) => void;
  "match:ended": (payload: MatchEndedPayload) => void;
  "quest:completed": (payload: QuestCompletedPayload) => void;
}

// -- HTTP JSON API (server/API.md section 2) ---------------------------------
// Response shapes untuk endpoint HTTP, diturunkan langsung dari tipe internal
// server (bukan ditulis ulang) supaya FE dan server tidak bisa drift diam-diam.

import type { ChallengeResult } from "../daily/challenge.ts";
import type { LeaderboardEntry } from "./dailyLeaderboard.ts";

export type { ChallengeResult, LeaderboardEntry };
export type {
  QuestDef,
  QuestFilter,
  QuestProgress,
  QuestReward,
  QuestWindow,
} from "../quest/quest.ts";

/** Amplop semua response HTTP: { ok: true, data } | { ok: false, error }. */
export type ApiEnvelope<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: string };

/** GET /daily/today */
export interface DailyTodayResponse {
  readonly number: number;
  readonly date: string;
}

/** POST /daily/play — hasil challenge + share card dua bahasa. */
export type DailyPlayResponse = ChallengeResult & {
  readonly shareCard: string;
  readonly shareCardEn: string;
};

/** GET /daily/leaderboard */
export type DailyLeaderboardResponse = readonly LeaderboardEntry[];

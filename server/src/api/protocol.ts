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
  /**
   * "casual" (default) has no skill loadout. "standard" enables `loadout:set`
   * but requires the server to have a chain configured (see
   * realtime/server.ts's LoadoutVerifier) - creating a "standard" room
   * without one is rejected. Mirrors realtime/rooms.ts's `RoomMode`.
   */
  readonly mode?: "casual" | "standard";
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

/**
 * `address` + `signature` from signing the `message` returned by a prior
 * `wallet:nonce` call (viem `account.signMessage({ message })` on the
 * client). See server/API.md's "Wallet link" section for the full flow.
 */
export interface WalletLinkPayload {
  readonly address: string;
  readonly signature: string;
}

/**
 * `skillIds` = 0-2 unique positive integers, the skill token ids the player
 * wants to load out with. Only valid in a "standard" mode room, lobby/draft
 * phase, after `wallet:link`. Verified against on-chain ownership before
 * being stored - see server/API.md's "Loadout" section.
 *
 * NOTE: this only gets a verified loadout attached to the player's match
 * state. Actually *executing* skill effects in-match (Wild Daub, Double
 * Call, ...) is not implemented yet - that's the engine's skill system,
 * CLAUDE.md step 5, still to come.
 */
export interface LoadoutSetPayload {
  readonly skillIds: readonly number[];
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

/** `message` is exactly what must be signed - see WalletLinkPayload. */
export interface WalletNonceAckData {
  readonly nonce: string;
  readonly message: string;
}

export interface WalletLinkAckData {
  /** The linked address, lowercased. */
  readonly address: string;
}

export interface ClientToServerEvents {
  "room:create": (payload: RoomCreatePayload, ack: Ack<RoomJoinedAckData>) => void;
  "room:join": (payload: RoomJoinPayload, ack: Ack<RoomJoinedAckData>) => void;
  "room:leave": (payload: EmptyAckData, ack: Ack<EmptyAckData>) => void;
  "draft:start": (payload: EmptyAckData, ack: Ack<LobbyAckData>) => void;
  "draft:submit": (payload: DraftSubmitPayload, ack: Ack<LobbyAckData>) => void;
  "match:call": (payload: MatchCallPayload, ack: Ack<MatchCallAckData>) => void;
  /** Issues a fresh single-use nonce (~5min expiry) for this socket to sign for wallet:link. */
  "wallet:nonce": (payload: EmptyAckData, ack: Ack<WalletNonceAckData>) => void;
  /** Verifies the signature against the last-issued nonce for this socket, then links the address. */
  "wallet:link": (payload: WalletLinkPayload, ack: Ack<WalletLinkAckData>) => void;
  /** Sets (or clears, with []) the caller's loadout - "standard" mode, lobby/draft phase, wallet-linked only. */
  "loadout:set": (payload: LoadoutSetPayload, ack: Ack<LobbyAckData>) => void;
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

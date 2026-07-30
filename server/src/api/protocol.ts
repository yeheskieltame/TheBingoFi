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
import type { SkillArgs } from "../engine/match.ts";
import type { PlazaMessage } from "../plaza/plaza.ts";

export type {
  LobbyPlayerView,
  LobbyView,
  MatchPlayerPublicView,
  MatchView,
  MyTurnArmedView,
  PendingSkillView,
} from "../realtime/views.ts";
export type { PlazaMessage } from "../plaza/plaza.ts";

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

/**
 * Uses one skill from the caller's own loadout - see server/API.md's "Skill
 * in-match" section. `effectType` must match one of the caller's loadout
 * entries with an available charge (WILD_DAUB/DOUBLE_CALL/GHOST_CALL/
 * CELL_SWAP - NULLIFY is reaction-only, see SkillRespondPayload). `args`
 * shape depends on effectType (WILD_DAUB needs `cellIndex`, CELL_SWAP needs
 * `a`/`b`, DOUBLE_CALL/GHOST_CALL need neither) - see engine/skills.ts's
 * validateSkillArgs for the authoritative rules, re-validated server-side
 * regardless of what the client sends.
 */
export interface SkillUsePayload {
  readonly effectType: string;
  readonly args?: SkillArgs;
}

/**
 * Answers an open Nullify window for a pending skill (see
 * SkillPendingPayload) - only valid from a player listed in that skill's
 * `awaiting`. `nullify: true` spends the responder's own NULLIFY charge and
 * cancels the pending skill outright; `false` just lets it through (once
 * everyone in `awaiting` has done so, the skill resolves).
 */
export interface SkillRespondPayload {
  readonly nullify: boolean;
}

/**
 * Sends a message to the global Plaza chat - CONCEPT.md §7.4b, not scoped
 * to any room (works for guests too, no room/wallet required). `skillId`
 * optionally attaches a skill the sender owns so FE can render it as a
 * card ("pamer skill") - ownership itself is never checked here, only
 * shape (see plaza/plaza.ts's validateSkillId). See server/API.md's
 * "Plaza chat" section for validation rules and rate limit.
 */
export interface PlazaSendPayload {
  readonly nickname: string;
  readonly text: string;
  readonly skillId?: number;
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

/** Ack for plaza:send - the message as actually stored (server-assigned `id`/`at`). */
export interface PlazaSendAckData {
  readonly message: PlazaMessage;
}

/** Ack for plaza:history - the current buffer, oldest -> newest, at most 100 messages. */
export interface PlazaHistoryAckData {
  readonly messages: readonly PlazaMessage[];
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
  /** Uses a skill from the caller's own loadout - see server/API.md's "Skill in-match" section. */
  "skill:use": (payload: SkillUsePayload, ack: Ack<MatchCallAckData>) => void;
  /** Answers an open Nullify window for a pending skill - true to Nullify (cancel it), false to pass. */
  "skill:respond": (payload: SkillRespondPayload, ack: Ack<MatchCallAckData>) => void;
  /** Sends a message to the global Plaza chat - see PlazaSendPayload. Rate limited to 1 per 2s per socket. */
  "plaza:send": (payload: PlazaSendPayload, ack: Ack<PlazaSendAckData>) => void;
  /** Fetches the current Plaza history buffer (oldest -> newest, at most 100 messages). */
  "plaza:history": (payload: EmptyAckData, ack: Ack<PlazaHistoryAckData>) => void;
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

/**
 * A skill use just opened a Nullify window - broadcast to the whole room
 * once, when the window opens (see server/API.md's "Skill in-match"
 * section). `awaiting` narrows over time as opponents respond, but that
 * narrowing itself is only observable via `match:state`'s
 * `MatchView.pendingSkill` (per-viewer broadcasts already cover it), not a
 * repeat of this event.
 */
export interface SkillPendingPayload {
  readonly playerId: string;
  readonly effectType: string;
  readonly awaiting: readonly string[];
}

/**
 * A pending skill has resolved - either Nullified by an opponent
 * (`nullified: true`, `nullifiedBy` set) or gone through, either because no
 * Nullify-capable opponent existed, CELL_SWAP (never opens a window), every
 * `awaiting` opponent passed, or the 15s window timed out (see
 * server/API.md's "Skill in-match" section).
 */
export interface SkillResolvedPayload {
  readonly playerId: string;
  readonly effectType: string;
  readonly nullified: boolean;
  readonly nullifiedBy?: string;
}

export interface ServerToClientEvents {
  "room:state": (view: LobbyView) => void;
  "match:state": (view: MatchView) => void;
  "match:ended": (payload: MatchEndedPayload) => void;
  "quest:completed": (payload: QuestCompletedPayload) => void;
  "skill:pending": (payload: SkillPendingPayload) => void;
  "skill:resolved": (payload: SkillResolvedPayload) => void;
  /** Broadcast to EVERY connected socket (not room-scoped, see io.emit in realtime/server.ts) whenever any Plaza message is sent. */
  "plaza:message": (message: PlazaMessage) => void;
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

/** One ERC-1155/OpenSea-style metadata attribute entry - see SkillMetadataResponse. */
export interface SkillMetadataAttribute {
  readonly trait_type: string;
  readonly value: string | number;
}

/**
 * GET /metadata/:id.json — standard ERC-1155 token metadata, returned
 * DIRECTLY (no `{ ok, data }` envelope, unlike every other HTTP endpoint
 * here) since this is what `SkillCollection.uri()` points wallets/
 * marketplaces at (CONCEPT.md §3's "identitas premium" metadata slots).
 * `image`/`animation_url` are placeholder asset URLs - the visual team
 * drops real files at those paths later, no contract/server change needed.
 */
export interface SkillMetadataResponse {
  readonly name: string;
  readonly description: string;
  readonly image: string;
  readonly animation_url: string;
  readonly attributes: readonly SkillMetadataAttribute[];
}

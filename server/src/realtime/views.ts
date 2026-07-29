/**
 * Redaction layer: turns internal Room state into what's safe to send over
 * the wire. This is the ONE place that decides what a client is allowed to
 * see - opponents' boards must NEVER appear in any payload, so every view
 * builder here is deliberately narrow rather than "send the room minus a
 * few fields".
 */

import { countCompletedLines } from "../engine/index.ts";
import type { Board } from "../engine/index.ts";
import type { Room, RoomMode, RoomPhase } from "./rooms.ts";

export interface LobbyPlayerView {
  readonly playerId: string;
  readonly nickname: string;
  readonly connected: boolean;
  readonly hasSubmittedBoard: boolean;
  /** Linked wallet address (lowercased), if any - see wallet:link. */
  readonly wallet?: string;
  /**
   * Verified loadout (skill token ids), if set - see loadout:set. Public on
   * purpose (CLAUDE.md: everyone sees opponents' picks); only board
   * contents stay secret.
   */
  readonly loadout?: readonly number[];
}

export interface LobbyView {
  readonly code: string;
  readonly phase: RoomPhase;
  readonly hostId: string;
  readonly mode: RoomMode;
  readonly players: readonly LobbyPlayerView[];
}

/** Public lobby state - no boards, safe to broadcast to everyone in the room. */
export function lobbyView(room: Room): LobbyView {
  return {
    code: room.code,
    phase: room.phase,
    hostId: room.hostId,
    mode: room.mode,
    players: room.players.map((player) => ({
      playerId: player.playerId,
      nickname: player.nickname,
      connected: player.connected,
      hasSubmittedBoard: player.board !== undefined,
      wallet: player.wallet,
      loadout: player.loadout,
    })),
  };
}

export interface MatchPlayerPublicView {
  readonly playerId: string;
  readonly nickname: string;
  readonly connected: boolean;
  readonly lineCount: number;
}

export interface MatchView {
  readonly code: string;
  readonly status: "in_progress" | "finished";
  readonly calledNumbers: readonly number[];
  readonly currentTurnPlayerId?: string;
  readonly winnerId?: string;
  /** The viewer's OWN board only. Every other player's board is omitted entirely. */
  readonly board?: Board;
  readonly players: readonly MatchPlayerPublicView[];
}

/**
 * Per-viewer match state: public info (called numbers, whose turn, line
 * counts, status/winner) plus the viewer's own board - nobody else's.
 * Returns undefined if the room has no match yet (still in lobby/draft).
 */
export function matchViewFor(room: Room, viewerId: string): MatchView | undefined {
  const match = room.match;
  if (!match) return undefined;

  const calledSet = new Set(match.calledNumbers);
  const viewerMatchPlayer = match.players.find((player) => player.id === viewerId);

  const players = match.players.map((matchPlayer) => {
    const roomPlayer = room.players.find((p) => p.playerId === matchPlayer.id);
    return {
      playerId: matchPlayer.id,
      nickname: roomPlayer?.nickname ?? "",
      connected: roomPlayer?.connected ?? false,
      lineCount: countCompletedLines(matchPlayer.board, calledSet),
    };
  });

  return {
    code: room.code,
    status: match.status,
    calledNumbers: match.calledNumbers,
    currentTurnPlayerId:
      match.status === "in_progress" ? match.players[match.currentTurnIndex]?.id : undefined,
    winnerId: match.winnerId,
    board: viewerMatchPlayer?.board,
    players,
  };
}

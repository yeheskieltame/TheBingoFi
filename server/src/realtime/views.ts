/**
 * Redaction layer: turns internal Room state into what's safe to send over
 * the wire. This is the ONE place that decides what a client is allowed to
 * see - opponents' boards must NEVER appear in any payload, so every view
 * builder here is deliberately narrow rather than "send the room minus a
 * few fields".
 */

import { countCompletedLinesForPlayer } from "../engine/index.ts";
import type { Board, SkillInstance } from "../engine/index.ts";
import type { Room, RoomMode, RoomPhase, RoomVisibility } from "./rooms.ts";

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
  /** True for the VS Bot seat (CONCEPT.md §2b) - lets FE style/icon the entry; the difficulty itself is already legible from `nickname` ("Bot Lv3"). */
  readonly isBot: boolean;
}

export interface LobbyView {
  readonly code: string;
  readonly phase: RoomPhase;
  readonly hostId: string;
  readonly mode: RoomMode;
  /** Room capacity, 2-5 - pair with `players.length` to render "2/4" slot counts. */
  readonly maxPlayers: number;
  /** "public" rooms are discoverable via room:list/room:quick; "private" are code-only. */
  readonly visibility: RoomVisibility;
  readonly players: readonly LobbyPlayerView[];
}

/** Public lobby state - no boards, safe to broadcast to everyone in the room. */
export function lobbyView(room: Room): LobbyView {
  return {
    code: room.code,
    phase: room.phase,
    hostId: room.hostId,
    mode: room.mode,
    maxPlayers: room.maxPlayers,
    visibility: room.visibility,
    players: room.players.map((player) => ({
      playerId: player.playerId,
      nickname: player.nickname,
      connected: player.connected,
      hasSubmittedBoard: player.board !== undefined,
      wallet: player.wallet,
      loadout: player.loadout,
      isBot: room.bot?.playerId === player.playerId,
    })),
  };
}

export interface RoomSummary {
  readonly code: string;
  readonly hostNickname: string;
  readonly playerCount: number;
  readonly maxPlayers: number;
  readonly mode: RoomMode;
}

/**
 * Room Browser entry (CONCEPT.md §2b, `room:list`) - deliberately minimal:
 * no player list, no board/match state, nothing that would help anyone
 * infer what's inside before joining. Only ever called on rooms
 * rooms.ts's listJoinableRooms already filtered to "public" - this
 * function has no visibility check of its own, so it must never be called
 * on a private room.
 */
export function roomSummaryView(room: Room): RoomSummary {
  const host = room.players.find((player) => player.playerId === room.hostId);
  return {
    code: room.code,
    hostNickname: host?.nickname ?? "",
    playerCount: room.players.length,
    maxPlayers: room.maxPlayers,
    mode: room.mode,
  };
}

export interface MatchPlayerPublicView {
  readonly playerId: string;
  readonly nickname: string;
  readonly connected: boolean;
  readonly lineCount: number;
}

/** Public: which skill use is currently awaiting Nullify decisions, and from whom - see skill:pending/skill:respond. Never carries `args` (e.g. WILD_DAUB's cellIndex), only what CLAUDE.md's socket spec lists. */
export interface PendingSkillView {
  readonly playerId: string;
  readonly effectType: string;
  readonly awaiting: readonly string[];
}

/** Set only for the viewer who currently has Double Call/Ghost Call armed for their own upcoming call(s) on this turn - see engine/match.ts's ArmedState. */
export interface MyTurnArmedView {
  readonly double?: { readonly callsLeft: number };
  readonly ghost?: boolean;
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
  /** The viewer's OWN loadout (effectType + remaining charges) only - never sent for other players. */
  readonly loadout?: readonly SkillInstance[];
  /** The viewer's OWN Wild-Daubed cell indices only - never sent for other players. */
  readonly daubedCells?: readonly number[];
  /** The viewer's OWN Ghost-Called numbers only - never sent for other players. */
  readonly ghostNumbers?: readonly number[];
  /** A skill use awaiting Nullify decisions, if any - public, see PendingSkillView. */
  readonly pendingSkill?: PendingSkillView;
  /** Double/Ghost Call armed for the viewer's own turn, if any - see MyTurnArmedView. */
  readonly myTurnArmed?: MyTurnArmedView;
}

/**
 * Per-viewer match state: public info (called numbers, whose turn, line
 * counts, status/winner, pending skill) plus the viewer's own board and
 * skill state (loadout, daubed cells, ghost numbers) - nobody else's. Line
 * counts use countCompletedLinesForPlayer (each player's own ghost/daub
 * marks count toward their own lines - see engine/lines.ts) rather than the
 * plain calledNumbers-only countCompletedLines, so a skill-completed line
 * shows up in the public lineCount same as an ordinary call would. Returns
 * undefined if the room has no match yet (still in lobby/draft).
 */
export function matchViewFor(room: Room, viewerId: string): MatchView | undefined {
  const match = room.match;
  if (!match) return undefined;

  const calledSet = new Set(match.calledNumbers);
  const viewerMatchPlayer = match.players.find((player) => player.id === viewerId);

  const players = match.players.map((matchPlayer) => {
    const roomPlayer = room.players.find((p) => p.playerId === matchPlayer.id);
    const ghostSet = new Set(matchPlayer.ghostNumbers ?? []);
    return {
      playerId: matchPlayer.id,
      nickname: roomPlayer?.nickname ?? "",
      connected: roomPlayer?.connected ?? false,
      lineCount: countCompletedLinesForPlayer(matchPlayer.board, calledSet, ghostSet, matchPlayer.daubedCells ?? []),
    };
  });

  const pendingSkill: PendingSkillView | undefined = match.pendingSkill
    ? {
        playerId: match.pendingSkill.playerId,
        effectType: match.pendingSkill.effectType,
        awaiting: match.pendingSkill.awaiting,
      }
    : undefined;

  const myTurnArmed: MyTurnArmedView | undefined =
    match.armed?.playerId === viewerId ? { double: match.armed.double, ghost: match.armed.ghost } : undefined;

  return {
    code: room.code,
    status: match.status,
    calledNumbers: match.calledNumbers,
    currentTurnPlayerId:
      match.status === "in_progress" ? match.players[match.currentTurnIndex]?.id : undefined,
    winnerId: match.winnerId,
    board: viewerMatchPlayer?.board,
    players,
    loadout: viewerMatchPlayer?.loadout,
    daubedCells: viewerMatchPlayer?.daubedCells,
    ghostNumbers: viewerMatchPlayer?.ghostNumbers,
    pendingSkill,
    myTurnArmed,
  };
}

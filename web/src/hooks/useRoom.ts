"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import type {
  LobbyView,
  MatchEndedPayload,
  MatchView,
  QuestCompletedPayload,
  RoomSummary,
  SkillResolvedPayload,
} from "@thebingofi/server/protocol";
import type { SkillArgs } from "@thebingofi/server/engine";

import { deriveRoomPhase, type RoomUiPhase } from "@/lib/roomPhase";
import { getSocket } from "@/lib/socket";
import { setStoredPlayerId } from "@/lib/storage";

/**
 * Client-only staging state for a skill whose args need extra board clicks
 * before skill:use can actually be sent - WILD_DAUB (1 own cell ->
 * `cellIndex`) and CELL_SWAP (2 own cells -> `a`/`b`). DOUBLE_CALL/
 * GHOST_CALL need no staging at all (see castSkill - they're sent
 * immediately with no args). `cellsNeeded` is supplied by the caller
 * (armSkillSelection) rather than hardcoded here, so this hook doesn't need
 * to know which effectType needs how many cells.
 */
export interface SkillSelectionState {
  readonly effectType: string;
  readonly cellsNeeded: number;
  readonly cells: readonly number[];
}

/**
 * How the current room was entered - client-side only, the server never
 * exposes this (LobbyView has no "autoStart" field, see server/API.md's
 * "Quick Match & Room Browser"). Tracked here so the UI can tell a Quick
 * Match room apart from a manually-created one (to hide the host "start
 * draft" button and show the "starts automatically" note instead) without
 * needing a server change - both players in a Quick Match room always get
 * there via their OWN `room:quick` call, so this is reliable per-client.
 */
export type RoomEntryKind = "create" | "join" | "quick" | "bot";

export interface RoomState {
  readonly code: string | null;
  readonly playerId: string | null;
  readonly lobby: LobbyView | null;
  readonly match: MatchView | null;
  readonly matchEnded: MatchEndedPayload | null;
  readonly questNotifications: readonly QuestCompletedPayload[];
  /** Short history of skill:resolved events received this session - see server/API.md's "Skill in-match". */
  readonly skillResolutions: readonly SkillResolvedPayload[];
  /** In-progress WILD_DAUB/CELL_SWAP cell selection, if any - see SkillSelectionState. */
  readonly skillSelection: SkillSelectionState | null;
  /** How this room was entered - see RoomEntryKind. Null until a room:create/join/quick/createBot ack lands. */
  readonly entryKind: RoomEntryKind | null;
  readonly error: string | null;
  readonly pending: boolean;
}

type Action =
  | {
      readonly type: "joined";
      readonly code: string;
      readonly playerId: string;
      readonly view: LobbyView;
      readonly entryKind: RoomEntryKind;
    }
  | { readonly type: "lobby"; readonly view: LobbyView }
  | { readonly type: "match"; readonly view: MatchView }
  | { readonly type: "ended"; readonly payload: MatchEndedPayload }
  | { readonly type: "quest"; readonly payload: QuestCompletedPayload }
  | { readonly type: "skillResolved"; readonly payload: SkillResolvedPayload }
  | { readonly type: "armSkillSelection"; readonly effectType: string; readonly cellsNeeded: number }
  | { readonly type: "cancelSkillSelection" }
  | { readonly type: "selectSkillCell"; readonly index: number }
  | { readonly type: "error"; readonly message: string }
  | { readonly type: "clearError" }
  | { readonly type: "pending"; readonly value: boolean }
  | { readonly type: "reset" };

const initialState: RoomState = {
  code: null,
  playerId: null,
  lobby: null,
  match: null,
  matchEnded: null,
  questNotifications: [],
  skillResolutions: [],
  skillSelection: null,
  entryKind: null,
  error: null,
  pending: false,
};

function reducer(state: RoomState, action: Action): RoomState {
  switch (action.type) {
    case "joined":
      return {
        ...state,
        code: action.code,
        playerId: action.playerId,
        lobby: action.view,
        entryKind: action.entryKind,
        error: null,
        pending: false,
      };
    case "lobby":
      return { ...state, lobby: action.view, pending: false };
    case "match":
      return { ...state, match: action.view, pending: false };
    case "ended":
      return { ...state, matchEnded: action.payload };
    case "quest":
      return { ...state, questNotifications: [...state.questNotifications, action.payload] };
    case "skillResolved":
      return { ...state, skillResolutions: [...state.skillResolutions, action.payload] };
    case "armSkillSelection":
      return { ...state, skillSelection: { effectType: action.effectType, cellsNeeded: action.cellsNeeded, cells: [] } };
    case "cancelSkillSelection":
      return { ...state, skillSelection: null };
    case "selectSkillCell":
      return state.skillSelection
        ? { ...state, skillSelection: { ...state.skillSelection, cells: [...state.skillSelection.cells, action.index] } }
        : state;
    case "error":
      return { ...state, error: action.message, pending: false };
    case "clearError":
      return { ...state, error: null };
    case "pending":
      return { ...state, pending: action.value };
    case "reset":
      return initialState;
    default:
      return state;
  }
}

/**
 * Client-side state machine for the whole /play flow (CLAUDE.md: room ->
 * draft -> playing -> finished), backed by the socket.io-client singleton
 * from lib/socket.ts. Every room:state / match:state / match:ended /
 * quest:completed event server/API.md documents folds into one reducer
 * here - components never touch the socket directly, they just render
 * `state` and call the actions this hook returns.
 */
export function useRoom() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const socketRef = useRef(getSocket());

  useEffect(() => {
    const socket = socketRef.current;
    socket.connect();

    socket.on("room:state", (view) => dispatch({ type: "lobby", view }));
    socket.on("match:state", (view) => dispatch({ type: "match", view }));
    socket.on("match:ended", (payload) => dispatch({ type: "ended", payload }));
    socket.on("quest:completed", (payload) => dispatch({ type: "quest", payload }));
    socket.on("skill:resolved", (payload) => dispatch({ type: "skillResolved", payload }));

    return () => {
      socket.off("room:state");
      socket.off("match:state");
      socket.off("match:ended");
      socket.off("quest:completed");
      socket.off("skill:resolved");
      socket.disconnect();
    };
  }, []);

  /** Options mirror RoomCreatePayload's maxPlayers/isPublic (server/API.md's "Create Room" - 2-5 players, public/private). */
  const createRoom = useCallback(
    (nickname: string, mode?: "casual" | "standard", options?: { maxPlayers?: number; isPublic?: boolean }) => {
      dispatch({ type: "pending", value: true });
      socketRef.current.emit(
        "room:create",
        { nickname, mode, maxPlayers: options?.maxPlayers, isPublic: options?.isPublic },
        (res) => {
          if (!res.ok) {
            dispatch({ type: "error", message: res.error });
            return;
          }
          setStoredPlayerId(res.playerId);
          dispatch({ type: "joined", code: res.code, playerId: res.playerId, view: res.view, entryKind: "create" });
        },
      );
    },
    [],
  );

  const joinRoom = useCallback((code: string, nickname: string) => {
    dispatch({ type: "pending", value: true });
    socketRef.current.emit("room:join", { code, nickname }, (res) => {
      if (!res.ok) {
        dispatch({ type: "error", message: res.error });
        return;
      }
      setStoredPlayerId(res.playerId);
      dispatch({ type: "joined", code: res.code, playerId: res.playerId, view: res.view, entryKind: "join" });
    });
  }, []);

  /** Quick Match (CONCEPT.md §2b): join a matching public casual room or create one - see server/API.md's "Quick Match & Room Browser". */
  const quickMatch = useCallback((nickname: string, size: number) => {
    dispatch({ type: "pending", value: true });
    socketRef.current.emit("room:quick", { nickname, size }, (res) => {
      if (!res.ok) {
        dispatch({ type: "error", message: res.error });
        return;
      }
      setStoredPlayerId(res.playerId);
      dispatch({ type: "joined", code: res.code, playerId: res.playerId, view: res.view, entryKind: "quick" });
    });
  }, []);

  /** VS Bot (CONCEPT.md §2b): private casual room against a bot, jumps straight to draft - see server/API.md's "VS Bot". */
  const createBotRoom = useCallback((nickname: string, level: number) => {
    dispatch({ type: "pending", value: true });
    socketRef.current.emit("room:createBot", { nickname, level }, (res) => {
      if (!res.ok) {
        dispatch({ type: "error", message: res.error });
        return;
      }
      setStoredPlayerId(res.playerId);
      dispatch({ type: "joined", code: res.code, playerId: res.playerId, view: res.view, entryKind: "bot" });
    });
  }, []);

  /**
   * Room Browser (CONCEPT.md §2b): one-shot room:list fetch. Returns a
   * Promise instead of folding into this hook's reducer - callers outside a
   * room session (the landing page browsing for a room to join) want their
   * own loading/error/poll state, not this hook's room-session state.
   */
  const listRooms = useCallback((): Promise<readonly RoomSummary[]> => {
    return new Promise((resolve, reject) => {
      socketRef.current.emit("room:list", {}, (res) => {
        if (!res.ok) {
          reject(new Error(res.error));
          return;
        }
        resolve(res.rooms);
      });
    });
  }, []);

  const leaveRoom = useCallback(() => {
    socketRef.current.emit("room:leave", {}, () => {
      dispatch({ type: "reset" });
    });
  }, []);

  const startDraft = useCallback(() => {
    dispatch({ type: "pending", value: true });
    socketRef.current.emit("draft:start", {}, (res) => {
      if (!res.ok) {
        dispatch({ type: "error", message: res.error });
        return;
      }
      dispatch({ type: "lobby", view: res.view });
    });
  }, []);

  const submitDraft = useCallback((numbers: readonly number[]) => {
    dispatch({ type: "pending", value: true });
    socketRef.current.emit("draft:submit", { numbers }, (res) => {
      if (!res.ok) {
        dispatch({ type: "error", message: res.error });
        return;
      }
      dispatch({ type: "lobby", view: res.view });
    });
  }, []);

  const callNumber = useCallback((number: number) => {
    dispatch({ type: "pending", value: true });
    socketRef.current.emit("match:call", { number }, (res) => {
      if (!res.ok) {
        dispatch({ type: "error", message: res.error });
        return;
      }
      dispatch({ type: "match", view: res.view });
    });
  }, []);

  /** Sends skill:use for `effectType` (no staging needed - DOUBLE_CALL/GHOST_CALL, or already-gathered args for WILD_DAUB/CELL_SWAP). Not named `useSkill` on purpose - a function named `useXxx` reads as a React hook to eslint-plugin-react-hooks, and this is called from plain click handlers, not render. */
  const castSkill = useCallback((effectType: string, args?: SkillArgs) => {
    dispatch({ type: "pending", value: true });
    socketRef.current.emit("skill:use", { effectType, args }, (res) => {
      if (!res.ok) {
        dispatch({ type: "error", message: res.error });
        return;
      }
      dispatch({ type: "match", view: res.view });
    });
  }, []);

  /** Answers an open Nullify window - true to Nullify (cancel the pending skill), false to pass ("Biarkan"). */
  const respondSkill = useCallback((nullify: boolean) => {
    dispatch({ type: "pending", value: true });
    socketRef.current.emit("skill:respond", { nullify }, (res) => {
      if (!res.ok) {
        dispatch({ type: "error", message: res.error });
        return;
      }
      dispatch({ type: "match", view: res.view });
    });
  }, []);

  /**
   * Wallet link (server/API.md's "Wallet link"): wallet:nonce -> sign the
   * returned message -> wallet:link, over the SAME room socket (so a
   * successful link, if already in a room, triggers the server's
   * room:state re-broadcast with `players[].wallet` filled in - handled by
   * the existing "room:state" listener above, no extra action needed here).
   * `signMessage` is injected (rather than importing wagmi into this hook)
   * so useRoom stays wallet-library-agnostic - see hooks/useWallet.ts's
   * `signMessage`, built from wagmi's useSignMessage.
   */
  const linkWallet = useCallback((address: string, signMessage: (message: string) => Promise<string>) => {
    dispatch({ type: "pending", value: true });
    socketRef.current.emit("wallet:nonce", {}, (nonceRes) => {
      if (!nonceRes.ok) {
        dispatch({ type: "error", message: nonceRes.error });
        return;
      }
      signMessage(nonceRes.message)
        .then((signature) => {
          socketRef.current.emit("wallet:link", { address, signature }, (linkRes) => {
            if (!linkRes.ok) {
              dispatch({ type: "error", message: linkRes.error });
              return;
            }
            dispatch({ type: "pending", value: false });
          });
        })
        .catch((err: unknown) => {
          dispatch({ type: "error", message: err instanceof Error ? err.message : "Wallet signature failed" });
        });
    });
  }, []);

  /** Sets (or clears) the caller's on-chain-verified loadout - "standard" mode rooms only, see server/API.md's "Mode room & Loadout". */
  const setLoadout = useCallback((skillIds: readonly number[]) => {
    dispatch({ type: "pending", value: true });
    socketRef.current.emit("loadout:set", { skillIds }, (res) => {
      if (!res.ok) {
        dispatch({ type: "error", message: res.error });
        return;
      }
      dispatch({ type: "lobby", view: res.view });
    });
  }, []);

  /** Starts client-side cell-picking for a skill that needs board clicks before it can be cast (WILD_DAUB: 1 cell, CELL_SWAP: 2) - see SkillSelectionState. */
  const armSkillSelection = useCallback((effectType: string, cellsNeeded: number) => {
    dispatch({ type: "armSkillSelection", effectType, cellsNeeded });
  }, []);

  const cancelSkillSelection = useCallback(() => dispatch({ type: "cancelSkillSelection" }), []);

  /** Registers one board-cell click while a WILD_DAUB/CELL_SWAP selection is armed. Once enough cells are picked, casts the skill (cellsNeeded 1 -> {cellIndex}, 2 -> {a, b}) and clears the selection - no-op if nothing is armed or `index` was already picked. */
  const selectSkillCell = useCallback(
    (index: number) => {
      const selection = state.skillSelection;
      if (!selection || selection.cells.includes(index)) return;

      const cells = [...selection.cells, index];
      if (cells.length < selection.cellsNeeded) {
        dispatch({ type: "selectSkillCell", index });
        return;
      }

      dispatch({ type: "cancelSkillSelection" });
      const args: SkillArgs = selection.cellsNeeded === 1 ? { cellIndex: cells[0] } : { a: cells[0], b: cells[1] };
      castSkill(selection.effectType, args);
    },
    [state.skillSelection, castSkill],
  );

  const clearError = useCallback(() => dispatch({ type: "clearError" }), []);

  const phase: RoomUiPhase | null = useMemo(() => deriveRoomPhase(state.lobby, state.matchEnded), [
    state.lobby,
    state.matchEnded,
  ]);

  return {
    state,
    phase,
    createRoom,
    joinRoom,
    quickMatch,
    createBotRoom,
    listRooms,
    leaveRoom,
    startDraft,
    submitDraft,
    callNumber,
    castSkill,
    respondSkill,
    linkWallet,
    setLoadout,
    armSkillSelection,
    cancelSkillSelection,
    selectSkillCell,
    clearError,
  };
}

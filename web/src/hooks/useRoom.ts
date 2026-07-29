"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import type { LobbyView, MatchEndedPayload, MatchView, QuestCompletedPayload } from "@thebingofi/server/protocol";

import { deriveRoomPhase, type RoomUiPhase } from "@/lib/roomPhase";
import { getSocket } from "@/lib/socket";
import { setStoredPlayerId } from "@/lib/storage";

export interface RoomState {
  readonly code: string | null;
  readonly playerId: string | null;
  readonly lobby: LobbyView | null;
  readonly match: MatchView | null;
  readonly matchEnded: MatchEndedPayload | null;
  readonly questNotifications: readonly QuestCompletedPayload[];
  readonly error: string | null;
  readonly pending: boolean;
}

type Action =
  | { readonly type: "joined"; readonly code: string; readonly playerId: string; readonly view: LobbyView }
  | { readonly type: "lobby"; readonly view: LobbyView }
  | { readonly type: "match"; readonly view: MatchView }
  | { readonly type: "ended"; readonly payload: MatchEndedPayload }
  | { readonly type: "quest"; readonly payload: QuestCompletedPayload }
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

    return () => {
      socket.off("room:state");
      socket.off("match:state");
      socket.off("match:ended");
      socket.off("quest:completed");
      socket.disconnect();
    };
  }, []);

  const createRoom = useCallback((nickname: string) => {
    dispatch({ type: "pending", value: true });
    socketRef.current.emit("room:create", { nickname }, (res) => {
      if (!res.ok) {
        dispatch({ type: "error", message: res.error });
        return;
      }
      setStoredPlayerId(res.playerId);
      dispatch({ type: "joined", code: res.code, playerId: res.playerId, view: res.view });
    });
  }, []);

  const joinRoom = useCallback((code: string, nickname: string) => {
    dispatch({ type: "pending", value: true });
    socketRef.current.emit("room:join", { code, nickname }, (res) => {
      if (!res.ok) {
        dispatch({ type: "error", message: res.error });
        return;
      }
      setStoredPlayerId(res.playerId);
      dispatch({ type: "joined", code: res.code, playerId: res.playerId, view: res.view });
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

  const clearError = useCallback(() => dispatch({ type: "clearError" }), []);

  const phase: RoomUiPhase | null = useMemo(() => deriveRoomPhase(state.lobby, state.matchEnded), [
    state.lobby,
    state.matchEnded,
  ]);

  return { state, phase, createRoom, joinRoom, leaveRoom, startDraft, submitDraft, callNumber, clearError };
}

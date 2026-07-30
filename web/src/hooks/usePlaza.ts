"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import type { PlazaMessage } from "@thebingofi/server/protocol";

import { getSocket } from "@/lib/socket";

export interface PlazaState {
  readonly messages: readonly PlazaMessage[];
  readonly error: string | null;
  readonly sending: boolean;
}

type Action =
  | { readonly type: "history"; readonly messages: readonly PlazaMessage[] }
  | { readonly type: "message"; readonly message: PlazaMessage }
  | { readonly type: "error"; readonly message: string }
  | { readonly type: "clearError" }
  | { readonly type: "sending"; readonly value: boolean };

const initialState: PlazaState = { messages: [], error: null, sending: false };

function reducer(state: PlazaState, action: Action): PlazaState {
  switch (action.type) {
    case "history":
      return { ...state, messages: action.messages };
    case "message":
      return { ...state, messages: [...state.messages, action.message] };
    case "error":
      return { ...state, error: action.message, sending: false };
    case "clearError":
      return { ...state, error: null };
    case "sending":
      return { ...state, sending: action.value };
    default:
      return state;
  }
}

/**
 * Client-side state for /plaza (CONCEPT.md §7.4b "Plaza — Ruang Sosial &
 * Showcase", server/API.md's "Plaza chat"): global chat, NOT scoped to a
 * room - works fully guest (no room:create/join/wallet:link needed), same
 * socket.io-client singleton as hooks/useRoom.ts (lib/socket.ts), connected/
 * disconnected on this hook's own mount/unmount since /plaza is its own
 * page.
 *
 * `plaza:message` is broadcast to EVERY connected socket including the
 * sender (server/API.md), so a sent message simply arrives back through the
 * same listener - no separate optimistic local append needed.
 */
export function usePlaza() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const socketRef = useRef(getSocket());

  useEffect(() => {
    const socket = socketRef.current;
    socket.connect();

    socket.on("plaza:message", (message) => dispatch({ type: "message", message }));

    socket.emit("plaza:history", {}, (res) => {
      if (res.ok) dispatch({ type: "history", messages: res.messages });
    });

    return () => {
      socket.off("plaza:message");
      socket.disconnect();
    };
  }, []);

  const send = useCallback((nickname: string, text: string, skillId?: number) => {
    dispatch({ type: "sending", value: true });
    socketRef.current.emit("plaza:send", { nickname, text, skillId }, (res) => {
      dispatch({ type: "sending", value: false });
      if (!res.ok) {
        dispatch({ type: "error", message: res.error });
      }
    });
  }, []);

  const clearError = useCallback(() => dispatch({ type: "clearError" }), []);

  return { ...state, send, clearError };
}

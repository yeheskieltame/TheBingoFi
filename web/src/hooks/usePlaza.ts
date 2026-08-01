"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import type { PlazaAttachment, PlazaMessage } from "@thebingofi/server/protocol";

import { ensureIdentity } from "@/lib/identity";
import { groupPlazaThreads, type PlazaThread } from "@/lib/plazaThreads";
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

    // Best-effort identity handshake (lib/identity.ts) so Plaza
    // participation is attributable to a stable accountId when one exists -
    // fired in parallel with plaza:history below, never blocks chat itself.
    // On failure the server just treats this socket as a fresh anonymous
    // identity (see server/API.md's "Identity" section) - nothing to
    // surface to the user here.
    ensureIdentity(socket).catch(() => {
      // Intentionally ignored - see comment above.
    });

    socket.emit("plaza:history", {}, (res) => {
      if (res.ok) dispatch({ type: "history", messages: res.messages });
    });

    return () => {
      socket.off("plaza:message");
      socket.disconnect();
    };
  }, []);

  const send = useCallback((nickname: string, text: string, attachment?: PlazaAttachment) => {
    dispatch({ type: "sending", value: true });
    socketRef.current.emit("plaza:send", { nickname, text, attachment }, (res) => {
      dispatch({ type: "sending", value: false });
      if (!res.ok) {
        dispatch({ type: "error", message: res.error });
      }
    });
  }, []);

  /**
   * Posts a reply to `parentId` (another message's `id`) via the same
   * `plaza:send`, just with `replyTo` set - the server enforces max depth 1
   * (a reply can't itself be replied to) and that the parent currently
   * exists, surfaced back through the same ack-error path as `send`.
   */
  const reply = useCallback((nickname: string, text: string, parentId: string, attachment?: PlazaAttachment) => {
    dispatch({ type: "sending", value: true });
    socketRef.current.emit("plaza:send", { nickname, text, attachment, replyTo: parentId }, (res) => {
      dispatch({ type: "sending", value: false });
      if (!res.ok) {
        dispatch({ type: "error", message: res.error });
      }
    });
  }, []);

  const clearError = useCallback(() => dispatch({ type: "clearError" }), []);

  // Flat history -> X-style threads (lib/plazaThreads.ts), newest post
  // first. Recomputed only when the underlying message list actually
  // changes (history load, a new post/reply arriving).
  const threads: readonly PlazaThread[] = useMemo(() => groupPlazaThreads(state.messages), [state.messages]);

  return { ...state, threads, send, reply, clearError };
}

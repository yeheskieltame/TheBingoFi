"use client";

import { useSyncExternalStore } from "react";

import { getStoredPlayerId } from "@/lib/storage";

function subscribe(): () => void {
  // localStorage has no same-tab change event to subscribe to, and the
  // stored playerId is only ever written by hooks/useRoom.ts on room
  // create/join, well before this hook cares - a static read is enough.
  return () => {};
}

function getServerSnapshot(): string | null {
  return null;
}

/**
 * SSR-safe read of the last stored playerId (see lib/storage.ts). Using
 * useSyncExternalStore instead of `useState` + `useEffect` avoids a
 * hydration mismatch: it renders `null` (the server snapshot) during SSR
 * and the first client pass, then reconciles to the real localStorage
 * value before paint - no flash, no "setState in effect" anti-pattern.
 */
export function useStoredPlayerId(): string | null {
  return useSyncExternalStore(subscribe, getStoredPlayerId, getServerSnapshot);
}

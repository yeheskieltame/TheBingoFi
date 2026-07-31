"use client";

import { useSyncExternalStore } from "react";

import { getStoredAccountId } from "@/lib/storage";

function subscribe(): () => void {
  // localStorage has no same-tab change event to subscribe to, and the
  // stored accountId is only ever written by lib/identity.ts's
  // `ensureIdentity` (called from hooks/useRoom.ts before room actions and
  // hooks/usePlaza.ts on connect) well before this hook cares - a static
  // read is enough.
  return () => {};
}

function getServerSnapshot(): string | null {
  return null;
}

/**
 * SSR-safe read of the last stored, stable accountId (see lib/storage.ts,
 * lib/identity.ts) - NOT the ephemeral per-room playerId (see
 * lib/storage.ts's `getStoredPlayerId`, unrelated). Using
 * useSyncExternalStore instead of `useState` + `useEffect` avoids a
 * hydration mismatch: it renders `null` (the server snapshot) during SSR
 * and the first client pass, then reconciles to the real localStorage
 * value before paint - no flash, no "setState in effect" anti-pattern.
 */
export function useStoredAccountId(): string | null {
  return useSyncExternalStore(subscribe, getStoredAccountId, getServerSnapshot);
}

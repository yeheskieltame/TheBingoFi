/**
 * Centralized `identity:hello` handshake (server/API.md's "Identity (akun
 * stabil)" section) - the ONE place `web/` emits this event, so hooks that
 * both want a stable accountId attached to the shared socket (hooks/
 * useRoom.ts, hooks/usePlaza.ts) never race each other into sending two
 * `identity:hello`s for the same connection.
 *
 * `playerId` in the ack is the STABLE accountId (NOT the ephemeral per-room
 * seat id `room:create`/`room:join`/etc. return under the same field name -
 * see lib/storage.ts's doc comment and server/API.md's confusing-on-purpose
 * naming note). We call it `accountId` everywhere on this side to avoid
 * perpetuating that confusion in the frontend.
 */

import type { AppSocket } from "@/lib/socket";
import {
  getStoredIdentityToken,
  setStoredAccountId,
  setStoredIdentityToken,
} from "@/lib/storage";

export interface IdentityResult {
  readonly accountId: string;
  readonly token: string;
}

/**
 * One in-flight/resolved handshake promise per socket connection, so
 * concurrent callers (e.g. useRoom.createRoom + usePlaza's connect effect,
 * if both hooks happened to mount around the same time) share a single
 * `identity:hello` emit instead of firing one each - race-safe by
 * construction, no locking needed since the promise itself is the lock.
 * Reset on "disconnect" so a fresh connection re-handshakes (a new
 * Socket.IO connection is a new server-side session regardless of whether
 * it's the same underlying `AppSocket` object being reused).
 */
const pendingBySocket = new WeakMap<AppSocket, Promise<IdentityResult>>();

/**
 * Ensures this socket has completed (or attempted) the identity handshake,
 * resuming the previously stored account via its saved token if one exists,
 * and returns the resulting `{ accountId, token }` - also persisting both to
 * localStorage (lib/storage.ts) as a side effect.
 *
 * Best-effort by design: `identity:hello` is optional server-side (an
 * anonymous per-connection identity is created automatically the first time
 * one is needed - see server/API.md), so callers should NEVER let a
 * rejection here block gameplay. The convention in this codebase is
 * `ensureIdentity(socket).catch(() => {})` followed by proceeding with the
 * action regardless (see hooks/useRoom.ts's `withIdentity`, hooks/
 * usePlaza.ts's connect effect).
 */
export function ensureIdentity(socket: AppSocket): Promise<IdentityResult> {
  const cached = pendingBySocket.get(socket);
  if (cached) return cached;

  const promise = new Promise<IdentityResult>((resolve, reject) => {
    const token = getStoredIdentityToken() ?? undefined;
    socket.emit("identity:hello", { token }, (res) => {
      if (!res.ok) {
        reject(new Error(res.error));
        return;
      }
      setStoredIdentityToken(res.token);
      setStoredAccountId(res.playerId);
      resolve({ accountId: res.playerId, token: res.token });
    });
  });

  pendingBySocket.set(socket, promise);
  socket.once("disconnect", () => {
    pendingBySocket.delete(socket);
  });

  return promise;
}

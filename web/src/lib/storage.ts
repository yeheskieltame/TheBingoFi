/**
 * Thin localStorage wrappers - the only place `web/` touches
 * `window.localStorage`. Every read/write is guarded so this module is safe
 * to import from anywhere (including during server-side rendering, where
 * `window` doesn't exist): reads return a safe default, writes are no-ops.
 *
 * Keys, matching CLAUDE.md's guest-play flow:
 *  - nickname: set on the landing page, reused everywhere a nickname is
 *    needed (room create/join, daily challenge).
 *  - playerId: the EPHEMERAL per-room seat id returned by
 *    room:create/join/quick/createBot (see hooks/useRoom.ts) - turn order &
 *    board redaction only, a fresh value every room. NOT the same thing as
 *    accountId below - see server/API.md's "Identity (akun stabil)" section
 *    for why the server keeps these two ids separate.
 *  - identityToken / accountId: the STABLE identity handshake result (see
 *    lib/identity.ts's `ensureIdentity`, server/API.md's `identity:hello`).
 *    `accountId` is what GET /quests/progress/:playerId (despite the URL
 *    segment's name - see API.md) and POST /daily/play use to keep quest
 *    progress and leaderboard scores consistent across matches/reconnects.
 *    `identityToken` is a CREDENTIAL that proves ownership of that account
 *    on the next connection - treat it like a password: never render it in
 *    the UI, never send it anywhere other than this project's own server.
 */

const NICKNAME_KEY = "thebingofi:nickname";
const PLAYER_ID_KEY = "thebingofi:playerId";
const IDENTITY_TOKEN_KEY = "thebingofi:identityToken";
const ACCOUNT_ID_KEY = "thebingofi:accountId";

function readKey(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeKey(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage unavailable (private mode, quota, ...) - guest play still
    // works for the current tab session, it just won't persist.
  }
}

export function getStoredNickname(): string {
  return readKey(NICKNAME_KEY) ?? "";
}

export function setStoredNickname(nickname: string): void {
  writeKey(NICKNAME_KEY, nickname);
}

/** Ephemeral per-room seat id from the last room:create/join/quick/createBot ack - NOT the stable accountId, see this module's doc comment above. */
export function getStoredPlayerId(): string | null {
  return readKey(PLAYER_ID_KEY);
}

export function setStoredPlayerId(playerId: string): void {
  writeKey(PLAYER_ID_KEY, playerId);
}

/**
 * Identity credential (see lib/identity.ts's `ensureIdentity`) - a bearer
 * token that resumes the SAME stable accountId on the next `identity:hello`
 * handshake. This is a CREDENTIAL, not a display value: never render it in
 * the UI, never send it to anything other than this project's own server.
 */
export function getStoredIdentityToken(): string | null {
  return readKey(IDENTITY_TOKEN_KEY);
}

export function setStoredIdentityToken(token: string): void {
  writeKey(IDENTITY_TOKEN_KEY, token);
}

/**
 * Stable accountId from the last successful `identity:hello` handshake (see
 * lib/identity.ts). Used by /quests and POST /daily/play to keep quest
 * progress/leaderboard scores consistent across matches, rooms, and
 * reconnects - see server/API.md's "Identity (akun stabil)" section.
 */
export function getStoredAccountId(): string | null {
  return readKey(ACCOUNT_ID_KEY);
}

export function setStoredAccountId(accountId: string): void {
  writeKey(ACCOUNT_ID_KEY, accountId);
}

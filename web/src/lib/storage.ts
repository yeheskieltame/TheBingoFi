/**
 * Thin localStorage wrappers - the only place `web/` touches
 * `window.localStorage`. Every read/write is guarded so this module is safe
 * to import from anywhere (including during server-side rendering, where
 * `window` doesn't exist): reads return a safe default, writes are no-ops.
 *
 * Two keys, matching CLAUDE.md's guest-play flow:
 *  - nickname: set on the landing page, reused everywhere a nickname is
 *    needed (room create/join, daily challenge).
 *  - playerId: set once a room create/join ack returns one (see
 *    hooks/useRoom.ts), reused by /quests to look up quest progress for
 *    "the player from your last session".
 */

const NICKNAME_KEY = "thebingofi:nickname";
const PLAYER_ID_KEY = "thebingofi:playerId";

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

export function getStoredPlayerId(): string | null {
  return readKey(PLAYER_ID_KEY);
}

export function setStoredPlayerId(playerId: string): void {
  writeKey(PLAYER_ID_KEY, playerId);
}

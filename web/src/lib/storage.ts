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
const LAST_BOARD_KEY = "thebingofi:lastBoard";

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

/**
 * The player's own board from their most recently FINISHED match (numbers,
 * row-major, plus which of those numbers were marked) - purely a cache so
 * /plaza's composer can offer "lampirkan Board" (CONCEPT.md §7.4b) even
 * though Plaza itself never sees room/match state. Written by /play (see
 * lib/matchShare.ts's `boardAttachmentFrom`) once a match reaches
 * `MatchView.status === "finished"`; read by app/plaza/page.tsx. Not
 * identity-scoped (same caveat as nickname above) - single browser tab,
 * single "last board", overwritten every time a match finishes.
 */
export interface StoredBoard {
  readonly numbers: readonly number[];
  readonly marked: readonly number[];
}

export function getStoredLastBoard(): StoredBoard | null {
  const raw = readKey(LAST_BOARD_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredBoard>;
    if (!Array.isArray(parsed.numbers)) return null;
    return { numbers: parsed.numbers, marked: Array.isArray(parsed.marked) ? parsed.marked : [] };
  } catch {
    return null;
  }
}

export function setStoredLastBoard(board: StoredBoard): void {
  writeKey(LAST_BOARD_KEY, JSON.stringify(board));
}

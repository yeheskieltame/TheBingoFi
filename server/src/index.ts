/**
 * Backend entrypoint - placeholder.
 *
 * For now this only re-exports the pure game engine (board/lines/match).
 * The realtime server (WebSocket room + matchmaking, per CLAUDE.md's
 * `server/` architecture) lands in a later phase and will live alongside
 * this file, importing the engine rather than reimplementing rules.
 */
export * from "./engine/index.ts";
export * from "./daily/index.ts";
export * from "./quest/index.ts";

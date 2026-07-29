import type { LobbyView, MatchEndedPayload } from "@thebingofi/server/protocol";

/** Which phase-specific screen /play should render. */
export type RoomUiPhase = "lobby" | "draft" | "playing" | "finished";

/**
 * Derives the UI phase from the latest LobbyView (room:state) and, once the
 * match has ended, the match:ended payload. Pure function, no React - kept
 * here instead of inline in hooks/useRoom.ts so it's trivial to reason
 * about/test in isolation.
 *
 * matchEnded wins once set: it fires exactly once when a match finishes
 * (win or abort), and there is no guarantee of a further room:state after
 * it (see server/API.md) to confirm phase "finished" independently.
 */
export function deriveRoomPhase(
  lobby: LobbyView | null,
  matchEnded: MatchEndedPayload | null,
): RoomUiPhase | null {
  if (matchEnded) return "finished";
  if (!lobby) return null;
  if (lobby.phase === "playing") return "playing";
  return lobby.phase;
}

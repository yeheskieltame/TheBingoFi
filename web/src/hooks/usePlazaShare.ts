"use client";

import { useCallback, useState } from "react";
import type { PlazaAttachment } from "@thebingofi/server/protocol";

import { getSocket } from "@/lib/socket";

export interface ShareResultInput {
  readonly nickname: string;
  readonly text: string;
  readonly won: boolean;
  readonly lines: number;
  readonly calls: number;
  readonly opponent?: string;
}

/**
 * One-shot "Bagikan ke Plaza" action for /play's finished screen
 * (components/MatchResult.tsx) - emits a single `plaza:send` carrying a
 * `result` PlazaAttachment (server/API.md's Plaza chat section) built from
 * real match data (see app/play/page.tsx's handleShareToPlaza).
 *
 * Deliberately NOT a full hooks/usePlaza.ts instance: this hook never
 * listens for `plaza:message`/`plaza:history` and never calls
 * connect()/disconnect() itself - it reuses the SAME socket.io-client
 * singleton (lib/socket.ts) that hooks/useRoom.ts already keeps connected
 * for the whole /play session, and only ever emits once per call. The
 * caller navigates to /plaza after a successful ack, where usePlaza takes
 * over with its own connect/history/listen lifecycle.
 */
export function usePlazaShare() {
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shareResult = useCallback((input: ShareResultInput): Promise<void> => {
    setSharing(true);
    setError(null);

    const attachment: PlazaAttachment = {
      kind: "result",
      won: input.won,
      lines: input.lines,
      calls: input.calls,
      ...(input.opponent ? { opponent: input.opponent } : {}),
    };

    return new Promise((resolve, reject) => {
      getSocket().emit("plaza:send", { nickname: input.nickname, text: input.text, attachment }, (res) => {
        setSharing(false);
        if (!res.ok) {
          setError(res.error);
          reject(new Error(res.error));
          return;
        }
        resolve();
      });
    });
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return { shareResult, sharing, error, clearError };
}

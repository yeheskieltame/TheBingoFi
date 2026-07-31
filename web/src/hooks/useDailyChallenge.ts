"use client";

import { useCallback, useEffect, useState } from "react";

import {
  getDailyLeaderboard,
  getDailyToday,
  postDailyPlay,
  type DailyLeaderboardEntry,
  type DailyPlayResult,
  type DailyToday,
} from "@/lib/api";
import { getStoredAccountId } from "@/lib/storage";

/**
 * Loads today's Daily Challenge (GET /daily/today) and its leaderboard
 * (GET /daily/leaderboard) on mount, and exposes `play` to submit a drafted
 * board (POST /daily/play) - see server/API.md section 2. Fetch/state logic
 * only; the page composes this with hooks/useDraftBoard.ts + dumb
 * components.
 *
 * `play` sends the stored accountId (lib/storage.ts), if one exists, so the
 * leaderboard score dedupes per account rather than per nickname (server/
 * API.md's "POST /daily/play" section). This reads localStorage directly
 * rather than going through lib/identity.ts's `ensureIdentity` - /daily
 * doesn't necessarily ever open a socket, and it shouldn't have to just to
 * play the daily challenge; an accountId is used opportunistically if one
 * was already established elsewhere (e.g. a prior /play or /plaza visit).
 */
export function useDailyChallenge() {
  const [today, setToday] = useState<DailyToday | null>(null);
  const [result, setResult] = useState<DailyPlayResult | null>(null);
  const [leaderboard, setLeaderboard] = useState<readonly DailyLeaderboardEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const loadLeaderboard = useCallback(async () => {
    const res = await getDailyLeaderboard();
    if (res.ok) setLeaderboard(res.data);
    else setError(res.error);
  }, []);

  // Inlined (rather than calling loadLeaderboard()) so both mount-time
  // fetches run as a single effect body - loadLeaderboard is reused as a
  // plain async function from `play` below, after the challenge is played.
  useEffect(() => {
    (async () => {
      const res = await getDailyToday();
      if (res.ok) setToday(res.data);
      else setError(res.error);
    })();
    (async () => {
      const res = await getDailyLeaderboard();
      if (res.ok) setLeaderboard(res.data);
      else setError(res.error);
    })();
  }, []);

  const play = useCallback(
    async (nickname: string, board: readonly number[]) => {
      setPending(true);
      setError(null);
      const accountId = getStoredAccountId() ?? undefined;
      const res = await postDailyPlay({ nickname, board, accountId });
      setPending(false);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setResult(res.data);
      await loadLeaderboard();
    },
    [loadLeaderboard],
  );

  return { today, result, leaderboard, error, pending, play };
}

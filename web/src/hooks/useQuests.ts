"use client";

import { useEffect, useState } from "react";

import { getQuestProgress, getQuests, type QuestDef, type QuestProgress } from "@/lib/api";
import { useStoredPlayerId } from "@/hooks/useStoredPlayerId";

/**
 * Loads the quest catalog (GET /quests) and, if a playerId was stored from
 * a previous /play session (see lib/storage.ts, set on room create/join),
 * that player's progress (GET /quests/progress/:playerId) - server/API.md
 * section 2.
 */
export function useQuests() {
  const [quests, setQuests] = useState<readonly QuestDef[] | null>(null);
  const [progress, setProgress] = useState<readonly QuestProgress[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const playerId = useStoredPlayerId();

  useEffect(() => {
    (async () => {
      const res = await getQuests();
      if (res.ok) setQuests(res.data);
      else setError(res.error);
    })();
  }, []);

  useEffect(() => {
    if (!playerId) return;
    (async () => {
      const res = await getQuestProgress(playerId);
      if (res.ok) setProgress(res.data);
      else setError(res.error);
    })();
  }, [playerId]);

  return { quests, progress, playerId, error };
}

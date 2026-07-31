"use client";

import { useEffect, useState } from "react";

import { getQuestProgress, getQuests, type QuestDef, type QuestProgress } from "@/lib/api";
import { useStoredAccountId } from "@/hooks/useStoredAccountId";

/**
 * Loads the quest catalog (GET /quests) and, if a stable accountId was
 * stored from a prior `identity:hello` handshake (see lib/identity.ts's
 * `ensureIdentity`, run from hooks/useRoom.ts before room actions and
 * hooks/usePlaza.ts on connect), that account's progress (GET
 * /quests/progress/:playerId - the URL segment is still literally named
 * `:playerId` server-side but now MEANS accountId, see server/API.md's
 * "Identity (akun stabil)" section) - server/API.md section 2.
 *
 * No accountId yet (never connected a socket this browser) is a normal,
 * non-error state: `quests` still loads and `progress` just stays `null`,
 * which QuestList already renders as "no progress yet" for every quest.
 */
export function useQuests() {
  const [quests, setQuests] = useState<readonly QuestDef[] | null>(null);
  const [progress, setProgress] = useState<readonly QuestProgress[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const accountId = useStoredAccountId();

  useEffect(() => {
    (async () => {
      const res = await getQuests();
      if (res.ok) setQuests(res.data);
      else setError(res.error);
    })();
  }, []);

  useEffect(() => {
    if (!accountId) return;
    (async () => {
      const res = await getQuestProgress(accountId);
      if (res.ok) setProgress(res.data);
      else setError(res.error);
    })();
  }, [accountId]);

  return { quests, progress, accountId, error };
}

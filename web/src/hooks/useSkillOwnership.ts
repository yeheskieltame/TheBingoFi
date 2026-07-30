"use client";

import { useCallback, useEffect, useState } from "react";
import type { Address } from "viem";

import { contractAddresses, publicClient, skillCollectionAbi } from "@/lib/chain";

/**
 * Reads SkillCollection.balanceOfBatch(owner, skillIds) - the on-chain
 * ownership check the FE needs for both the /play standard-mode loadout
 * picker (which skills can I even pick) and /market ("you own N"). Returns
 * a skillId -> balance map; skills with balance 0 are simply absent-safe
 * (use `balances.get(id) ?? 0n`).
 *
 * No-ops (empty map) when `owner` or `skillIds` is empty - e.g. wallet not
 * connected yet, or catalog still loading.
 */
export function useSkillOwnership(owner: Address | undefined, skillIds: readonly number[]) {
  const [balances, setBalances] = useState<ReadonlyMap<number, bigint>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  // Stable key so the effect only re-runs when the actual id set changes,
  // not on every new (but equal-content) array identity from the caller.
  const idsKey = skillIds.join(",");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!owner || skillIds.length === 0) {
        setBalances(new Map());
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const raw = (await publicClient.readContract({
          address: contractAddresses.collection,
          abi: skillCollectionAbi,
          functionName: "balanceOfBatch",
          args: [skillIds.map(() => owner), skillIds.map((id) => BigInt(id))],
        })) as readonly bigint[];

        if (!cancelled) {
          const next = new Map<number, bigint>();
          skillIds.forEach((id, index) => next.set(id, raw[index] ?? 0n));
          setBalances(next);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to read skill ownership");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- idsKey stands in for skillIds
  }, [owner, idsKey, reloadToken]);

  return { balances, loading, error, reload };
}

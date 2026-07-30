"use client";

import { useCallback, useEffect, useState } from "react";

import { contractAddresses, marketplaceAbi, publicClient } from "@/lib/chain";

/** Refetch cadence while /market is open, on top of the explicit reload() after a purchase - see hooks/useSkillPrices.ts's doc below and contracts/README.md's demand-decay model (price also moves purely with elapsed time, not just purchases). */
const REFRESH_INTERVAL_MS = 30_000;

/**
 * Reads Marketplace.priceOf(skillId) - the CURRENT dynamic price (scarcity
 * ramp + demand decay already applied), for each id in `skillIds`.
 * contracts/README.md is explicit that this is the ONLY correct quote
 * source: "FE HARUS quote lewat priceOf, jangan pernah hitung harga manual
 * dari basePrice" - price moves both with purchases (minted rising) and
 * with elapsed time (decay), so a one-time read of `sales(skillId).basePrice`
 * is never enough.
 *
 * Auto-refreshes every REFRESH_INTERVAL_MS while mounted (price drifts with
 * wall-clock time even with no purchases) - callers should also call
 * `reload()` right after a confirmed purchase for an immediate update
 * (see app/market/page.tsx).
 */
export function useSkillPrices(skillIds: readonly number[]) {
  const [prices, setPrices] = useState<ReadonlyMap<number, bigint>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);
  const idsKey = skillIds.join(",");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (skillIds.length === 0) {
        setPrices(new Map());
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const entries = await Promise.all(
          skillIds.map(async (id) => {
            const price = (await publicClient.readContract({
              address: contractAddresses.marketplace,
              abi: marketplaceAbi,
              functionName: "priceOf",
              args: [BigInt(id)],
            })) as bigint;
            return [id, price] as const;
          }),
        );
        if (!cancelled) setPrices(new Map(entries));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to read skill price");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- idsKey stands in for skillIds
  }, [idsKey, reloadToken]);

  useEffect(() => {
    if (skillIds.length === 0) return;
    const interval = setInterval(reload, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- idsKey stands in for skillIds
  }, [idsKey, reload]);

  return { prices, loading, error, reload };
}

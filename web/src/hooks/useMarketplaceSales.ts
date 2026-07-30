"use client";

import { useCallback, useEffect, useState } from "react";

import { contractAddresses, marketplaceAbi, publicClient } from "@/lib/chain";

/** Mirrors contracts/src/Marketplace.sol's `struct Sale { price; maxSupply; minted; active }`. */
export interface SaleInfo {
  readonly price: bigint;
  readonly maxSupply: bigint;
  readonly minted: bigint;
  readonly active: boolean;
}

/**
 * Reads Marketplace.sales(skillId) for each id in `skillIds` - price/stock
 * for /market's buy flow (contracts/README.md's "Fungsi yang Dipanggil
 * Frontend": "Ambil price dari Marketplace.sales(skillId) sebelum submit
 * tx"). The public getter returns a positional tuple (price, maxSupply,
 * minted, active), not a named struct - see server/src/chain/abi.ts's
 * comment on the same quirk.
 */
export function useMarketplaceSales(skillIds: readonly number[]) {
  const [sales, setSales] = useState<ReadonlyMap<number, SaleInfo>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);
  const idsKey = skillIds.join(",");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (skillIds.length === 0) {
        setSales(new Map());
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const entries = await Promise.all(
          skillIds.map(async (id) => {
            const raw = (await publicClient.readContract({
              address: contractAddresses.marketplace,
              abi: marketplaceAbi,
              functionName: "sales",
              args: [BigInt(id)],
            })) as readonly [bigint, bigint, bigint, boolean];
            const [price, maxSupply, minted, active] = raw;
            return [id, { price, maxSupply, minted, active }] as const;
          }),
        );
        if (!cancelled) setSales(new Map(entries));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to read marketplace sales");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- idsKey stands in for skillIds
  }, [idsKey, reloadToken]);

  return { sales, loading, error, reload };
}

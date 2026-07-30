"use client";

import { useCallback, useEffect, useState } from "react";

import { contractAddresses, marketplaceAbi, publicClient } from "@/lib/chain";

/**
 * Mirrors contracts/src/Marketplace.sol's `struct Sale { basePrice;
 * maxSupply; minted; active; lastPurchaseAt }` (Marketplace v2, dynamic
 * pricing - contracts/README.md's "Dynamic Pricing"). `basePrice` here is
 * the STATIC listing price only - never the price to actually quote a
 * purchase with, see hooks/useSkillPrices.ts's `priceOf` read for that.
 */
export interface SaleInfo {
  readonly basePrice: bigint;
  readonly maxSupply: bigint;
  readonly minted: bigint;
  readonly active: boolean;
  readonly lastPurchaseAt: bigint;
}

/**
 * Reads Marketplace.sales(skillId) for each id in `skillIds` - stock
 * (maxSupply/minted) + base listing price for /market (contracts/README.md's
 * "Fungsi yang Dipanggil Frontend"). The public getter returns a positional
 * tuple (basePrice, maxSupply, minted, active, lastPurchaseAt), not a named
 * struct - see server/src/chain/abi.ts's comment on the same quirk.
 *
 * NOT the quote source for a purchase - `basePrice` here is static and does
 * NOT reflect scarcity ramp/demand decay. Use hooks/useSkillPrices.ts's
 * `priceOf` read for that (contracts/README.md is explicit about this).
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
            })) as readonly [bigint, bigint, bigint, boolean, bigint];
            const [basePrice, maxSupply, minted, active, lastPurchaseAt] = raw;
            return [id, { basePrice, maxSupply, minted, active, lastPurchaseAt }] as const;
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

"use client";

import { useCallback, useEffect, useState } from "react";

import { contractAddresses, decodeEffectType, publicClient, skillRegistryAbi } from "@/lib/chain";

/** Normalized SkillDef - mirrors contracts/src/SkillRegistry.sol's `struct SkillDef` (same shape as server/src/chain/reader.ts's SkillDef, reimplemented here since web/ can't import server-only chain code, see web/README.md). */
export interface SkillCatalogEntry {
  readonly skillId: number;
  /** Decoded from the on-chain bytes32 (see lib/chain.ts's decodeEffectType), e.g. "WILD_DAUB". */
  readonly effectType: string;
  readonly charges: number;
  readonly cooldown: number;
  readonly maxPerLoadout: number;
  readonly rarity: number;
  readonly active: boolean;
  readonly metadataURI: string;
}

interface RawSkillDef {
  readonly skillId: bigint;
  readonly effectType: string;
  readonly charges: number;
  readonly cooldown: number;
  readonly maxPerLoadout: number;
  readonly rarity: number;
  readonly active: boolean;
  readonly metadataURI: string;
}

/**
 * Reads the full on-chain skill catalog: SkillRegistry.nextSkillId, then
 * getSkill(1..nextSkillId-1) - see contracts/README.md's "Fungsi yang
 * Dipanggil Frontend". Read-only, works without a connected wallet (used by
 * both the /play standard-mode loadout picker and /market). Uses the
 * standalone publicClient from lib/chain.ts, not a wagmi hook, so it works
 * identically for guests and connected wallets alike.
 *
 * `enabled` (default true) skips the fetch entirely - e.g. /play's page.tsx
 * passes `false` for "casual" rooms, where the loadout picker never
 * renders, to avoid a pointless RPC round-trip.
 */
export function useSkillCatalog(enabled = true) {
  const [catalog, setCatalog] = useState<readonly SkillCatalogEntry[] | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!enabled) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const nextSkillId = (await publicClient.readContract({
          address: contractAddresses.registry,
          abi: skillRegistryAbi,
          functionName: "nextSkillId",
        })) as bigint;

        const ids = Array.from({ length: Math.max(0, Number(nextSkillId) - 1) }, (_, index) => index + 1);

        const defs = await Promise.all(
          ids.map(async (id) => {
            const raw = (await publicClient.readContract({
              address: contractAddresses.registry,
              abi: skillRegistryAbi,
              functionName: "getSkill",
              args: [BigInt(id)],
            })) as RawSkillDef;
            const entry: SkillCatalogEntry = {
              skillId: Number(raw.skillId),
              effectType: decodeEffectType(raw.effectType),
              charges: Number(raw.charges),
              cooldown: Number(raw.cooldown),
              maxPerLoadout: Number(raw.maxPerLoadout),
              rarity: Number(raw.rarity),
              active: raw.active,
              metadataURI: raw.metadataURI,
            };
            return entry;
          }),
        );

        if (!cancelled) setCatalog(defs);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to read skill catalog");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, reloadToken]);

  return { catalog, loading, error, reload };
}

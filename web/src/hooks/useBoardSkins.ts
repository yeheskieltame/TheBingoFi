"use client";

import { useMemo } from "react";

import { useSkillCatalog } from "@/hooks/useSkillCatalog";
import { useSkillMetadata } from "@/hooks/useSkillMetadata";
import { useSkillOwnership } from "@/hooks/useSkillOwnership";
import { useWallet } from "@/hooks/useWallet";
import { boardSkinsFrom, type BoardSkin } from "@/lib/boardSkins";

/**
 * Assembles board skins (lib/boardSkins.ts) for MatchBoard/DraftBoard: on-
 * chain catalog -> per-skill metadata (Featured Number attribute) -> wallet
 * ownership -> number -> art map. Cosmetic only, works in every mode
 * (casual included) since it's about wallet ownership, not a match loadout.
 *
 * No wallet connected -> `useSkillCatalog`/`useSkillOwnership` are disabled/
 * no-op (their own `enabled`/empty-owner short-circuits) and `useSkillMetadata`
 * receives an empty id list, so guest play never fires the extra RPC/HTTP
 * round-trips this needs - just an empty map, board renders as plain numbers.
 */
export function useBoardSkins(): ReadonlyMap<number, BoardSkin> {
  const wallet = useWallet();
  const hasWallet = Boolean(wallet.address);

  const catalog = useSkillCatalog(hasWallet);
  const skillIds = useMemo(() => catalog.catalog?.map((entry) => entry.skillId) ?? [], [catalog.catalog]);

  const { metadata } = useSkillMetadata(skillIds);
  const { balances } = useSkillOwnership(hasWallet ? wallet.address : undefined, skillIds);

  return useMemo(() => boardSkinsFrom(metadata, balances), [metadata, balances]);
}

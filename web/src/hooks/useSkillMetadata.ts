"use client";

import { useEffect, useState } from "react";
import type { SkillMetadataResponse } from "@thebingofi/server/protocol";

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3001";

export type { SkillMetadataResponse };

/**
 * Fetches GET /metadata/:id.json (server/API.md) for each id in `skillIds` -
 * name/description/image/animation_url (CONCEPT.md §3 "identitas premium").
 * Purely decorative on top of the on-chain catalog (hooks/useSkillCatalog.ts):
 * a missing/failed entry (chain not configured -> 503, skill not found -> 404,
 * network error, ...) is simply absent from the returned map rather than
 * surfaced as a page-level error - callers fall back to the effectType-derived
 * name (see i18n/strings.ts's play.skills.effectNames) when metadata for a
 * given id isn't available, so /market/plaza/profile never show a broken
 * state over what's just missing art/copy.
 */
export function useSkillMetadata(skillIds: readonly number[]) {
  const [metadata, setMetadata] = useState<ReadonlyMap<number, SkillMetadataResponse>>(new Map());
  const [loading, setLoading] = useState(false);
  const idsKey = skillIds.join(",");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (skillIds.length === 0) {
        setMetadata(new Map());
        return;
      }

      setLoading(true);
      const entries = await Promise.all(
        skillIds.map(async (id) => {
          try {
            const res = await fetch(`${SERVER_URL}/metadata/${id}.json`);
            if (!res.ok) return null;
            const data = (await res.json()) as SkillMetadataResponse;
            return [id, data] as const;
          } catch {
            return null;
          }
        }),
      );

      if (!cancelled) {
        const next = new Map<number, SkillMetadataResponse>();
        for (const entry of entries) if (entry) next.set(entry[0], entry[1]);
        setMetadata(next);
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- idsKey stands in for skillIds
  }, [idsKey]);

  return { metadata, loading };
}

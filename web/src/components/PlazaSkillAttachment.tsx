import Link from "next/link";

import SkillMedia from "@/components/SkillMedia";
import SkillTierBadge from "@/components/SkillTierBadge";
import { useLocale } from "@/hooks/useLocale";
import { strings } from "@/i18n/strings";
import type { SkillTier } from "@/lib/skillTier";

export interface PlazaSkillAttachmentProps {
  readonly skillId: number;
  readonly name: string;
  /** GET /metadata/:id.json's `image` (hooks/useSkillMetadata.ts) - undefined falls back to SkillMedia's initials tile, never a broken-image icon. */
  readonly imageUrl?: string;
  readonly tier?: SkillTier;
}

/**
 * Big "showcase" skill card attached to a Plaza message or shown live in the
 * composer's preview (CONCEPT.md §7.4b "pamer skill": "render sebagai
 * kartu, bukan teks"). Replaces the old small text-only PlazaSkillCard -
 * real NFT artwork via SkillMedia (same broken-URL fallback /market's
 * SkillMarketCard relies on, since metadata `image` URLs aren't on
 * next/image's remotePatterns allowlist and placeholder assets can 404),
 * full display name, tier badge, click -> /market.
 */
export default function PlazaSkillAttachment({ skillId, name, imageUrl, tier }: PlazaSkillAttachmentProps) {
  const locale = useLocale();
  const t = strings[locale].plaza;

  return (
    <Link
      href="/market"
      className="group mt-2 block w-full max-w-[280px] overflow-hidden rounded-2xl border border-glacier/40 bg-glacier/10 backdrop-blur-md transition-all hover:-translate-y-0.5 hover:border-frost/50 hover:bg-glacier/20"
    >
      <SkillMedia imageUrl={imageUrl} label={name} className="h-36 w-full object-cover" />
      <div className="space-y-1 p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate font-display text-sm font-bold text-frost">{name}</span>
          {tier && <SkillTierBadge tier={tier} />}
        </div>
        <span className="block text-[0.7rem] text-ice/55">
          #{skillId} · <span className="text-frost/70 group-hover:text-frost">{t.viewInMarket} →</span>
        </span>
      </div>
    </Link>
  );
}

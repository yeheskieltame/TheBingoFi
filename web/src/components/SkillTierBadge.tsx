import { useLocale } from "@/hooks/useLocale";
import { strings } from "@/i18n/strings";
import { TIER_BADGE_CLASS, type SkillTier } from "@/lib/skillTier";

export interface SkillTierBadgeProps {
  readonly tier: SkillTier;
}

/**
 * Small colored label naming a skill's scarcity tier (see lib/skillTier.ts).
 * Shared by /market (SkillMarketCard), /plaza (PlazaSkillAttachment) and
 * /profile (ProfileSkillCard) so all three read a skill's rarity the same way.
 * Deliberately minimal styling - a HOOK for the UI team to make this feel
 * premium later (task brief: "styling tier beda ... sebagai HOOK premium"),
 * not a finished visual design.
 */
export default function SkillTierBadge({ tier }: SkillTierBadgeProps) {
  const locale = useLocale();
  const t = strings[locale].market;
  const label = { common: t.tierCommon, uncommon: t.tierUncommon, rare: t.tierRare, superRare: t.tierSuperRare }[tier];

  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${TIER_BADGE_CLASS[tier]}`}>
      {label}
    </span>
  );
}

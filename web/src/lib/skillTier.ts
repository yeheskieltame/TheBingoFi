/**
 * Scarcity "tier" derived from a skill's on-chain `maxSupply` (Marketplace
 * sale) - CONCEPT.md §3's "identitas premium per skill": rarer skills should
 * *feel* rarer in the UI. Purely a presentational bucketing, not an on-chain
 * concept (no contract field named "tier") - see contracts/README.md's
 * seeded catalog (5 skills, maxSupply 10..1000) for the thresholds this
 * mirrors.
 *
 * Shared by /market (SkillMarketCard), /plaza (PlazaSkillAttachment, the
 * `kind: "skill"` card attached to chat messages) and /profile
 * (ProfileSkillCard) so all three surfaces classify the same skillId the
 * same way.
 */
export type SkillTier = "common" | "uncommon" | "rare" | "superRare";

export function tierForMaxSupply(maxSupply: bigint): SkillTier {
  if (maxSupply <= 10n) return "superRare";
  if (maxSupply <= 100n) return "rare";
  if (maxSupply <= 500n) return "uncommon";
  return "common";
}

/**
 * Tailwind classes per tier - deliberately minimal (task brief: "styling
 * tier beda sebagai HOOK premium, tim UI yang mempercantik"). Border goes on
 * the card container, badge on the small tier label - see SkillTierBadge.tsx
 * and each page's skill card component.
 */
export const TIER_BORDER_CLASS: Record<SkillTier, string> = {
  common: "border-slate-800",
  uncommon: "border-emerald-700",
  rare: "border-indigo-600",
  superRare: "border-amber-500",
};

export const TIER_BADGE_CLASS: Record<SkillTier, string> = {
  common: "bg-slate-800 text-slate-300",
  uncommon: "bg-emerald-900/60 text-emerald-300",
  rare: "bg-indigo-900/60 text-indigo-300",
  superRare: "bg-amber-900/60 text-amber-300",
};

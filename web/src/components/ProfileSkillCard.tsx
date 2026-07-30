import SkillTierBadge from "@/components/SkillTierBadge";
import { useLocale } from "@/hooks/useLocale";
import type { SkillCatalogEntry } from "@/hooks/useSkillCatalog";
import { strings } from "@/i18n/strings";
import type { SkillTier } from "@/lib/skillTier";

export interface ProfileSkillCardProps {
  readonly entry: SkillCatalogEntry;
  readonly balance: bigint;
  readonly tier: SkillTier | undefined;
}

/**
 * Dumb: one owned skill in a public profile's collection (CONCEPT.md §7.4b
 * "profil publik shareable ... koleksi skill on-chain") - name, tier badge,
 * quantity owned. Used by ProfileView, which owns the balanceOfBatch read.
 */
export default function ProfileSkillCard({ entry, balance, tier }: ProfileSkillCardProps) {
  const locale = useLocale();
  const effectNames: Record<string, string> = strings[locale].play.skills.effectNames;

  return (
    <li className="flex items-center justify-between gap-2 rounded border border-slate-800 bg-slate-900/60 p-3">
      <div>
        <p className="font-semibold text-white">{effectNames[entry.effectType] ?? entry.effectType}</p>
        <p className="text-xs text-slate-500">#{entry.skillId}</p>
      </div>
      <div className="flex items-center gap-2">
        {tier && <SkillTierBadge tier={tier} />}
        <span className="rounded bg-slate-800 px-2 py-0.5 text-xs font-semibold text-slate-200">×{balance.toString()}</span>
      </div>
    </li>
  );
}

import Link from "next/link";

import SkillTierBadge from "@/components/SkillTierBadge";
import { useLocale } from "@/hooks/useLocale";
import { strings } from "@/i18n/strings";
import type { SkillTier } from "@/lib/skillTier";

export interface PlazaSkillCardProps {
  readonly skillId: number;
  readonly name: string;
  readonly tier: SkillTier | undefined;
}

/**
 * Small clickable card attached to a Plaza chat message that carries a
 * `skillId` (CONCEPT.md §7.4b: "pesan chat bisa melampirkan kartu skill
 * yang dimiliki (render sebagai kartu, bukan teks)") - name + tier, click
 * takes you to /market. Rendered alongside the message's free-text `text`,
 * not instead of it.
 */
export default function PlazaSkillCard({ skillId, name, tier }: PlazaSkillCardProps) {
  const locale = useLocale();
  const t = strings[locale].plaza;

  return (
    <Link
      href="/market"
      className="mt-1 flex w-fit items-center gap-2 rounded border border-slate-700 bg-slate-800/60 px-2 py-1.5 text-xs hover:border-indigo-500 hover:bg-slate-800"
    >
      <span className="font-semibold text-slate-100">{name}</span>
      {tier && <SkillTierBadge tier={tier} />}
      <span className="text-slate-500">
        #{skillId} · {t.viewInMarket}
      </span>
    </Link>
  );
}

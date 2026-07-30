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
 * Kartu skill yang menempel pada pesan Plaza ber-`skillId` (CONCEPT.md §7.4b:
 * "pesan chat bisa melampirkan kartu skill yang dimiliki (render sebagai
 * kartu, bukan teks)") - klik menuju /market.
 *
 * Sengaja dibuat kontras dengan teks pesan di sekitarnya (blok kaca + aksen
 * gletser + nama pakai display font): ini fitur pamer, jadi kalau tampilannya
 * setipis teks biasa, fungsinya hilang.
 */
export default function PlazaSkillCard({ skillId, name, tier }: PlazaSkillCardProps) {
  const locale = useLocale();
  const t = strings[locale].plaza;

  return (
    <Link
      href="/market"
      className="group mt-2 flex w-fit max-w-full items-center gap-3 rounded-2xl border border-glacier/40 bg-glacier/12 p-2 pr-3 transition-all hover:-translate-y-0.5 hover:border-frost/50 hover:bg-glacier/20"
    >
      {/* Petak inisial sebagai stand-in art skill - slot ilustrasi asli ada di
          metadata (lihat /market SkillMedia), belum dipakai di chat. */}
      <span
        aria-hidden
        className="grid size-10 shrink-0 place-items-center rounded-xl bg-night/60 font-display text-sm font-bold text-frost ring-1 ring-white/15"
      >
        {name.slice(0, 2).toUpperCase()}
      </span>

      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="truncate font-display text-sm font-bold text-frost">{name}</span>
          {tier && <SkillTierBadge tier={tier} />}
        </span>
        <span className="block text-[0.7rem] text-ice/55">
          #{skillId} · <span className="text-frost/70 group-hover:text-frost">{t.viewInMarket} →</span>
        </span>
      </span>
    </Link>
  );
}

import SkillMedia from "@/components/SkillMedia";
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
 * Dumb: satu skill milik sebuah profil publik (CONCEPT.md §7.4b "profil publik
 * shareable ... koleksi skill on-chain") - art, nama, tier, jumlah dimiliki.
 *
 * Dirender sebagai kartu ber-art (bukan baris teks) karena halaman ini yang
 * dibagikan keluar: koleksi harus terlihat seperti koleksi, bukan tabel.
 */
export default function ProfileSkillCard({ entry, balance, tier }: ProfileSkillCardProps) {
  const locale = useLocale();
  const effectNames: Record<string, string> = strings[locale].play.skills.effectNames;
  const name = effectNames[entry.effectType] ?? entry.effectType;

  return (
    <li className="group relative flex aspect-[3/4] flex-col justify-end overflow-hidden rounded-2xl border border-white/10 bg-night/70 transition-all hover:-translate-y-1 hover:border-frost/40">
      <SkillMedia
        imageUrl="/images/card/card-marketplace.webp"
        label={name}
        className="absolute inset-0 h-full w-full transition-transform duration-500 group-hover:scale-105"
      />
      <div aria-hidden className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-night via-night/85 to-transparent" />

      {balance > 1n && (
        <span className="absolute right-2 top-2 rounded-full bg-night/85 px-2 py-0.5 font-display text-xs font-bold text-frost ring-1 ring-white/15">
          ×{balance.toString()}
        </span>
      )}

      <div className="relative space-y-1 p-3">
        <h3 className="truncate font-display text-sm font-bold leading-tight text-frost">{name}</h3>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[0.7rem] text-ice/45">#{entry.skillId}</span>
          {tier && <SkillTierBadge tier={tier} />}
        </div>
      </div>
    </li>
  );
}

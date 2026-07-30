/**
 * Dumb: placeholder satu kartu katalog selama data on-chain (katalog, sale,
 * harga) belum termuat. Bentuk & rasionya sengaja meniru SkillMarketCard
 * (aspect 3/4 + blok info di bawah) supaya grid tidak melompat tingginya
 * begitu data asli masuk.
 */
export default function SkillCardSkeleton() {
  return (
    <li
      aria-hidden
      className="flex aspect-[3/4] animate-pulse flex-col justify-end overflow-hidden rounded-2xl border border-white/10 bg-night/55"
    >
      <div className="space-y-2 p-3">
        <div className="h-4 w-2/3 rounded bg-white/10" />
        <div className="h-3 w-full rounded bg-white/8" />
        <div className="flex items-baseline justify-between gap-2">
          <div className="h-5 w-1/3 rounded bg-white/10" />
          <div className="h-3 w-1/5 rounded bg-white/8" />
        </div>
        <div className="h-1 w-full rounded-full bg-white/10" />
        <div className="flex items-center gap-2">
          <div className="h-8 w-20 rounded-full bg-white/10" />
          <div className="h-8 flex-1 rounded-full bg-white/10" />
        </div>
        <div className="h-7 w-full rounded-full bg-white/8" />
      </div>
    </li>
  );
}

import { formatEther } from "viem";
import type { SkillMetadataResponse } from "@thebingofi/server/protocol";

import AmountStepper from "@/components/AmountStepper";
import SkillMedia from "@/components/SkillMedia";
import SkillTierBadge from "@/components/SkillTierBadge";
import { useLocale } from "@/hooks/useLocale";
import type { SkillCatalogEntry } from "@/hooks/useSkillCatalog";
import type { SaleInfo } from "@/hooks/useMarketplaceSales";
import { strings } from "@/i18n/strings";
import { explorerTxUrl } from "@/lib/chain";
import { tierForMaxSupply } from "@/lib/skillTier";

export type BuyStatus = "idle" | "submitting" | "confirming" | "success" | "error";

export interface SkillMarketCardProps {
  readonly entry: SkillCatalogEntry;
  readonly sale: SaleInfo | undefined;
  /** Marketplace.priceOf(skillId) - the current dynamic price, THE quote source (contracts/README.md's Dynamic Pricing). */
  readonly currentPrice: bigint | undefined;
  readonly priceLoading: boolean;
  readonly metadata: SkillMetadataResponse | undefined;
  readonly ownedBalance: bigint;
  readonly amount: number;
  readonly onAmountChange: (amount: number) => void;
  readonly walletConnected: boolean;
  readonly buyDisabled: boolean;
  readonly buyStatus: BuyStatus;
  readonly buyError: string | null;
  readonly txHash: string | undefined;
  readonly onBuy: () => void;
  /** Buka dialog detail skill (art besar + seluruh statistik) - lihat /market page.tsx. */
  readonly onViewDetails: () => void;
}

/**
 * Dumb: one skill's marketplace listing - catalog metadata (on-chain +
 * GET /metadata/:id.json), dynamic price (`priceOf`) vs. base listing price
 * (discount/premium badge), stock + scarcity tier, and a simple amount
 * picker + buy action. Used by /market's page.tsx, which owns all the
 * on-chain reads/writes + metadata fetch.
 */
export default function SkillMarketCard({
  entry,
  sale,
  currentPrice,
  priceLoading,
  metadata,
  ownedBalance,
  amount,
  onAmountChange,
  walletConnected,
  buyDisabled,
  buyStatus,
  buyError,
  txHash,
  onBuy,
  onViewDetails,
}: SkillMarketCardProps) {
  const locale = useLocale();
  const t = strings[locale].market;
  // Typed as Record<string, string>, see LoadoutPicker.tsx's same note.
  const effectNames: Record<string, string> = strings[locale].play.skills.effectNames;
  const fallbackName = effectNames[entry.effectType] ?? entry.effectType;
  const displayName = metadata?.name ?? fallbackName;
  /** Art default sampai metadata skill menunjuk ilustrasinya sendiri. */
  const artUrl = metadata?.image ?? "/images/card/card-marketplace.webp";

  const remaining = sale ? sale.maxSupply - sale.minted : 0n;
  const soldOut = sale ? remaining <= 0n : false;
  const canBuy = walletConnected && sale?.active === true && !soldOut && entry.active && currentPrice !== undefined;
  const tier = sale ? tierForMaxSupply(sale.maxSupply) : undefined;
  const stockPct = sale && sale.maxSupply > 0n ? Number((sale.minted * 100n) / sale.maxSupply) : 0;

  // Dynamic price vs. base listing price (contracts/README.md's Dynamic
  // Pricing: scarcity ramp pushes it up, demand decay pulls it down) - only
  // meaningful once both reads have resolved.
  let priceBadge: "discount" | "premium" | null = null;
  let pricePct = 0;
  if (sale && sale.basePrice > 0n && currentPrice !== undefined) {
    if (currentPrice < sale.basePrice) {
      pricePct = Number(((sale.basePrice - currentPrice) * 100n) / sale.basePrice);
      if (pricePct >= 1) priceBadge = "discount";
    } else if (currentPrice > sale.basePrice) {
      pricePct = Number(((currentPrice - sale.basePrice) * 100n) / sale.basePrice);
      if (pricePct >= 1) priceBadge = "premium";
    }
  }

  return (
    /* Satu bidang: art memenuhi kartu, seluruh info duduk sebagai overlay di
       atasnya. Sebelumnya art dan blok teks terpisah, jadi kartunya jangkung
       (tombol beli sampai keluar layar) dan menyisakan ruang kosong. */
    <li className="group relative flex aspect-[3/4] flex-col justify-end overflow-hidden rounded-2xl border border-white/10 bg-night/70 transition-all hover:-translate-y-1 hover:border-frost/40">
      <SkillMedia
        imageUrl={artUrl}
        animationUrl={metadata?.animation_url}
        label={displayName}
        className="absolute inset-0 h-full w-full transition-transform duration-500 group-hover:scale-105"
      />
      <div aria-hidden className="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-night via-night/85 to-transparent" />


      <div className="absolute left-2 top-2 flex flex-col items-start gap-1">
        {tier && <SkillTierBadge tier={tier} />}
        {priceBadge === "discount" && (
          <span className="rounded-full bg-emerald-500/90 px-2 py-0.5 font-display text-[0.7rem] font-bold text-night">
            ▼ {pricePct}%
          </span>
        )}
        {priceBadge === "premium" && (
          <span className="rounded-full bg-amber-400/90 px-2 py-0.5 font-display text-[0.7rem] font-bold text-night">
            ▲ {pricePct}%
          </span>
        )}
        {!entry.active && <span className="rounded-full bg-night/80 px-2 py-0.5 text-[0.7rem] text-ice">{t.inactive}</span>}
      </div>

      <div className="relative space-y-2 p-3">
        <div>
          <button
            type="button"
            onClick={onViewDetails}
            className="block max-w-full truncate text-left font-display text-base font-bold leading-tight text-frost transition-colors hover:text-glacier"
          >
            {displayName}
          </button>
          <p className="truncate text-[0.7rem] text-ice/50">
            #{entry.skillId} · {t.charges} {entry.charges} · {t.maxPerLoadout} {entry.maxPerLoadout}
          </p>
        </div>

        {sale ? (
          <>
            <div className="flex items-baseline justify-between gap-2">
              <span className="flex items-baseline gap-1.5">
                <span className="font-display text-lg font-bold leading-none text-frost">
                  {priceLoading || currentPrice === undefined ? "—" : formatEther(currentPrice)}
                </span>
                <span className="text-[0.7rem] text-ice/45">ETH</span>
                {priceBadge === "discount" && (
                  <span className="text-[0.7rem] text-ice/35 line-through">{formatEther(sale.basePrice)}</span>
                )}
              </span>
              <span className={`text-[0.7rem] ${soldOut ? "text-red-300" : "text-ice/45"}`}>
                {soldOut ? t.soldOut : `${remaining.toString()}/${sale.maxSupply.toString()}`}
              </span>
            </div>

            <div className="h-1 w-full overflow-hidden rounded-full bg-white/15" aria-hidden="true">
              <div
                className={`h-full ${soldOut ? "bg-red-400" : "bg-glacier"}`}
                style={{ width: `${Math.min(100, Math.max(0, stockPct))}%` }}
              />
            </div>
          </>
        ) : (
          <p className="text-xs text-ice/45">{t.loading}</p>
        )}

        <div className="flex items-center gap-2">
          <AmountStepper
            id={`amount-${entry.skillId}`}
            label={t.amountLabel}
            value={amount}
            max={Number(remaining > 0n ? remaining : 1n)}
            disabled={!canBuy}
            onChange={onAmountChange}
          />
          <button
            type="button"
            onClick={onBuy}
            disabled={!canBuy || buyDisabled}
            className="flex-1 rounded-full bg-glacier-deep py-1.5 font-display text-sm font-bold text-frost transition-colors hover:bg-glacier disabled:cursor-not-allowed disabled:opacity-30"
          >
            {soldOut
              ? t.soldOut
              : buyStatus === "submitting"
                ? t.buying
                : buyStatus === "confirming"
                  ? t.confirming
                  : `${t.buy} · ${ownedBalance.toString()}`}
          </button>
        </div>

        <button
          type="button"
          onClick={onViewDetails}
          className="w-full rounded-full border border-white/15 py-1.5 font-display text-xs font-semibold text-ice transition-colors hover:border-white/35 hover:text-frost"
        >
          {t.viewDetails}
        </button>

        {buyStatus === "success" && txHash && (
          <p className="text-[0.7rem] text-frost">
            {t.buySuccess} ·{" "}
            <a href={explorerTxUrl(txHash)} target="_blank" rel="noreferrer" className="underline">
              {t.viewTx}
            </a>
          </p>
        )}
        {buyStatus === "error" && buyError && (
          <p role="alert" className="text-[0.7rem] text-red-300">
            {t.buyError}: {buyError}
          </p>
        )}
      </div>
    </li>
  );
}

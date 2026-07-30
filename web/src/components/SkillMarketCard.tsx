import { formatEther } from "viem";
import type { SkillMetadataResponse } from "@thebingofi/server/protocol";

import SkillMedia from "@/components/SkillMedia";
import SkillTierBadge from "@/components/SkillTierBadge";
import { useLocale } from "@/hooks/useLocale";
import type { SkillCatalogEntry } from "@/hooks/useSkillCatalog";
import type { SaleInfo } from "@/hooks/useMarketplaceSales";
import { strings } from "@/i18n/strings";
import { explorerTxUrl } from "@/lib/chain";
import { TIER_BORDER_CLASS, tierForMaxSupply } from "@/lib/skillTier";

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
}: SkillMarketCardProps) {
  const locale = useLocale();
  const t = strings[locale].market;
  // Typed as Record<string, string>, see LoadoutPicker.tsx's same note.
  const effectNames: Record<string, string> = strings[locale].play.skills.effectNames;
  const fallbackName = effectNames[entry.effectType] ?? entry.effectType;
  const displayName = metadata?.name ?? fallbackName;

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
      priceBadge = "discount";
      pricePct = Number(((sale.basePrice - currentPrice) * 100n) / sale.basePrice);
    } else if (currentPrice > sale.basePrice) {
      priceBadge = "premium";
      pricePct = Number(((currentPrice - sale.basePrice) * 100n) / sale.basePrice);
    }
  }

  return (
    <li className={`space-y-2 rounded-2xl border bg-night/45 p-4 backdrop-blur-md ${tier ? TIER_BORDER_CLASS[tier] : "border-white/10"}`}>
      <div className="flex items-start gap-3">
        <SkillMedia imageUrl={metadata?.image} animationUrl={metadata?.animation_url} label={displayName} />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-base font-bold text-frost">{displayName}</h3>
            {tier && <SkillTierBadge tier={tier} />}
            {!entry.active && <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs text-ice">{t.inactive}</span>}
          </div>
          <p className="text-xs text-ice/55">
            #{entry.skillId} · {t.rarity} {entry.rarity}
          </p>
          {metadata?.description && <p className="text-xs text-ice/55">{metadata.description}</p>}
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-frost/80">
        <dt className="text-ice/45">{t.charges}</dt>
        <dd>{entry.charges}</dd>
        <dt className="text-ice/45">{t.cooldown}</dt>
        <dd>{entry.cooldown}</dd>
        <dt className="text-ice/45">{t.maxPerLoadout}</dt>
        <dd>{entry.maxPerLoadout}</dd>
        <dt className="text-ice/45">{t.yourBalance}</dt>
        <dd>{ownedBalance.toString()}</dd>
      </dl>

      {sale ? (
        <div className="space-y-1.5 text-sm">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-ice/45">{t.price}:</span>
            {priceLoading || currentPrice === undefined ? (
              <span className="text-ice/45">{t.loading}</span>
            ) : (
              <span className="font-display font-bold text-frost">{formatEther(currentPrice)} ETH</span>
            )}
            {priceBadge === "discount" && (
              <>
                <span className="text-xs text-ice/45 line-through">{formatEther(sale.basePrice)} ETH</span>
                <span className="rounded bg-emerald-900/60 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300">
                  {t.discountBadge} {pricePct}%
                </span>
              </>
            )}
            {priceBadge === "premium" && (
              <span className="rounded bg-amber-900/60 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300">
                {t.premiumBadge}
              </span>
            )}
          </div>

          <div className="space-y-1">
            <p className={soldOut ? "text-red-300" : "text-frost/70"}>
              {soldOut ? t.soldOut : `${t.stockRemaining} ${remaining.toString()} ${t.stockOf} ${sale.maxSupply.toString()}`}
            </p>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10" aria-hidden="true">
              <div
                className={`h-full ${soldOut ? "bg-red-400" : "bg-glacier"}`}
                style={{ width: `${Math.min(100, Math.max(0, stockPct))}%` }}
              />
            </div>
          </div>
        </div>
      ) : (
        <p className="text-xs text-ice/45">{t.loading}</p>
      )}

      <div className="flex items-center gap-2">
        <label htmlFor={`amount-${entry.skillId}`} className="text-xs text-ice/55">
          {t.amountLabel}
        </label>
        <input
          id={`amount-${entry.skillId}`}
          type="number"
          min={1}
          max={Math.max(1, Number(remaining > 0n ? remaining : 1n))}
          value={amount}
          onChange={(event) => onAmountChange(Math.max(1, Number(event.target.value) || 1))}
          disabled={!canBuy}
          className="w-16 rounded-full border border-white/15 bg-night/60 px-3 py-1 text-center text-sm text-frost disabled:opacity-40"
        />
        <button
          type="button"
          onClick={onBuy}
          disabled={!canBuy || buyDisabled}
          className="ml-auto rounded-full bg-glacier-deep px-5 py-1.5 font-display text-sm font-bold text-frost transition-colors hover:bg-glacier disabled:cursor-not-allowed disabled:opacity-40"
        >
          {soldOut
            ? t.soldOut
            : buyStatus === "submitting"
              ? t.buying
              : buyStatus === "confirming"
                ? t.confirming
                : t.buy}
        </button>
      </div>
      <p className="text-[11px] text-slate-500">{t.refundNote}</p>

      {!walletConnected && <p className="text-xs text-amber-200">{t.connectPrompt}</p>}
      {buyStatus === "success" && txHash && (
        <p className="text-xs text-frost">
          {t.buySuccess} ·{" "}
          <a href={explorerTxUrl(txHash)} target="_blank" rel="noreferrer" className="underline">
            {t.viewTx}
          </a>
        </p>
      )}
      {buyStatus === "error" && buyError && (
        <p role="alert" className="text-xs text-red-300">
          {t.buyError}: {buyError}
        </p>
      )}
    </li>
  );
}

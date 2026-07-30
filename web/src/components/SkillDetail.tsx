"use client";

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
import type { BuyStatus } from "@/components/SkillMarketCard";

export interface SkillDetailProps {
  readonly entry: SkillCatalogEntry;
  readonly sale: SaleInfo | undefined;
  readonly currentPrice: bigint | undefined;
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
 * Dumb: isi dialog detail satu skill - art besar + SELURUH statistik yang di
 * kartu katalog sengaja disembunyikan (cooldown, rarity, deskripsi metadata,
 * harga dasar vs harga berjalan), plus aksi beli supaya pemain tidak perlu
 * menutup dialog dulu.
 */
export default function SkillDetail({
  entry,
  sale,
  currentPrice,
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
}: SkillDetailProps) {
  const locale = useLocale();
  const t = strings[locale].market;
  const effectNames: Record<string, string> = strings[locale].play.skills.effectNames;
  const displayName = metadata?.name ?? effectNames[entry.effectType] ?? entry.effectType;
  const artUrl = metadata?.image ?? "/images/card/card-marketplace.webp";

  const remaining = sale ? sale.maxSupply - sale.minted : 0n;
  const soldOut = sale ? remaining <= 0n : false;
  const canBuy = walletConnected && sale?.active === true && !soldOut && entry.active && currentPrice !== undefined;
  const tier = sale ? tierForMaxSupply(sale.maxSupply) : undefined;

  const stats: readonly (readonly [string, string])[] = [
    [t.charges, String(entry.charges)],
    [t.cooldown, String(entry.cooldown)],
    [t.maxPerLoadout, String(entry.maxPerLoadout)],
    [t.rarity, String(entry.rarity)],
    [t.yourBalance, ownedBalance.toString()],
    [t.stock, sale ? `${remaining.toString()} / ${sale.maxSupply.toString()}` : "—"],
  ];

  return (
    <div className="grid gap-5 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)]">
      <div className="relative mx-auto aspect-[344/568] w-40 overflow-hidden rounded-xl sm:mx-0 sm:w-full">
        <SkillMedia
          imageUrl={artUrl}
          animationUrl={metadata?.animation_url}
          label={displayName}
          className="absolute inset-0 h-full w-full"
        />
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-xl font-bold text-frost">{displayName}</h3>
            {tier && <SkillTierBadge tier={tier} />}
            {!entry.active && (
              <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs text-ice">{t.inactive}</span>
            )}
          </div>
          <p className="text-xs text-ice/45">#{entry.skillId}</p>
          {metadata?.description && (
            <p className="text-sm leading-relaxed text-frost/70">{metadata.description}</p>
          )}
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
          {stats.map(([label, value]) => (
            <div key={label} className="flex items-baseline justify-between gap-2 border-b border-white/8 pb-1">
              <dt className="text-xs text-ice/45">{label}</dt>
              <dd className="font-display text-sm font-bold text-frost">{value}</dd>
            </div>
          ))}
        </dl>

        <div className="space-y-1">
          <div className="flex items-baseline gap-2">
            <span className="font-display text-2xl font-bold text-frost">
              {currentPrice === undefined ? "—" : formatEther(currentPrice)}
            </span>
            <span className="text-sm text-ice/45">ETH</span>
          </div>
          {sale && currentPrice !== undefined && currentPrice !== sale.basePrice && (
            <p className="text-xs text-ice/45">
              {t.price}: <span className="line-through">{formatEther(sale.basePrice)} ETH</span>
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <AmountStepper
            id={`detail-amount-${entry.skillId}`}
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
            className="flex-1 rounded-full bg-glacier-deep py-2.5 font-display text-base font-bold text-frost transition-colors hover:bg-glacier disabled:cursor-not-allowed disabled:opacity-30"
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

        {!walletConnected && <p className="text-xs text-amber-200">{t.connectPrompt}</p>}
        <p className="text-[0.7rem] text-ice/35">{t.refundNote}</p>

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
      </div>
    </div>
  );
}

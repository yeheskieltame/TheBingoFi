"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

import { formatEther } from "viem";
import { LuExternalLink } from "react-icons/lu";

import Dialog from "@/components/Dialog";
import SkillDetail from "@/components/SkillDetail";
import SkillMarketCard, { type BuyStatus } from "@/components/SkillMarketCard";
import SkillCardSkeleton from "@/components/SkillCardSkeleton";
import SkillMedia from "@/components/SkillMedia";
import SkillTierBadge from "@/components/SkillTierBadge";
import { useBuySkill } from "@/hooks/useBuySkill";
import { useLocale } from "@/hooks/useLocale";
import { useMarketplaceSales } from "@/hooks/useMarketplaceSales";
import { useSkillCatalog } from "@/hooks/useSkillCatalog";
import { useSkillMetadata } from "@/hooks/useSkillMetadata";
import { useSkillOwnership } from "@/hooks/useSkillOwnership";
import { useSkillPrices } from "@/hooks/useSkillPrices";
import { useWallet } from "@/hooks/useWallet";
import { strings } from "@/i18n/strings";
import { contractAddresses, explorerAddressUrl } from "@/lib/chain";
import { tierForMaxSupply } from "@/lib/skillTier";

/**
 * Primary-sale storefront (contracts/README.md's "Alur pembelian (user)"):
 * on-chain catalog (SkillRegistry) + dynamic price (Marketplace.priceOf,
 * refreshed periodically - hooks/useSkillPrices.ts) + stock (Marketplace.
 * sales) + your balance (SkillCollection.balanceOfBatch) + off-chain
 * metadata (GET /metadata/:id.json), all read-only and visible without a
 * wallet - buying (Marketplace.buy) needs one connected.
 */
export default function MarketPage() {
  const locale = useLocale();
  const t = strings[locale].market;
  const wallet = useWallet();

  const catalog = useSkillCatalog();
  const skillIds = catalog.catalog?.map((entry) => entry.skillId) ?? [];
  const ownership = useSkillOwnership(wallet.address, skillIds);
  const sales = useMarketplaceSales(skillIds);
  const prices = useSkillPrices(skillIds);
  const metadata = useSkillMetadata(skillIds);
  const buy = useBuySkill();

  const [amounts, setAmounts] = useState<Record<number, number>>({});
  const [buyingSkillId, setBuyingSkillId] = useState<number | null>(null);
  /** Skill yang dialog detailnya terbuka; null = tertutup. */
  const [detailSkillId, setDetailSkillId] = useState<number | null>(null);

  useEffect(() => {
    if (buy.isConfirmed && buyingSkillId !== null) {
      ownership.reload();
      sales.reload();
      prices.reload();
    }
    // Only re-run when the tx actually confirms - ownership/sales/prices.reload are stable-enough setters, re-including them would just re-trigger on every catalog refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buy.isConfirmed]);

  function amountFor(skillId: number): number {
    return amounts[skillId] ?? 1;
  }

  function statusFor(skillId: number): BuyStatus {
    if (buyingSkillId !== skillId) return "idle";
    if (buy.error) return "error";
    if (buy.isConfirmed) return "success";
    if (buy.isConfirming) return "confirming";
    if (buy.isSubmitting) return "submitting";
    return "idle";
  }

  function handleBuy(skillId: number, priceWei: bigint) {
    setBuyingSkillId(skillId);
    buy.reset();
    buy.buy(skillId, amountFor(skillId), priceWei).catch(() => {
      // Surfaced via buy.error / statusFor above - avoid an unhandled rejection.
    });
  }

  const anyBuyInFlight = buy.isSubmitting || buy.isConfirming;
  const detailEntry = (catalog.catalog ?? []).find((entry) => entry.skillId === detailSkillId);

  // Sorotan: skill dengan maxSupply terkecil yang sale-nya sudah termuat -
  // paling langka = paling layak dipajang di kepala halaman.
  const effectNames: Record<string, string> = strings[locale].play.skills.effectNames;
  const spotlight = (catalog.catalog ?? [])
    .filter((entry) => sales.sales.has(entry.skillId))
    .sort((a, b) => Number(sales.sales.get(a.skillId)!.maxSupply - sales.sales.get(b.skillId)!.maxSupply))[0];
  const spotlightSale = spotlight ? sales.sales.get(spotlight.skillId) : undefined;
  const spotlightMetadata = spotlight ? metadata.metadata.get(spotlight.skillId) : undefined;
  const spotlightTier = spotlightSale ? tierForMaxSupply(spotlightSale.maxSupply) : undefined;
  const spotlightPrice = spotlight ? prices.prices.get(spotlight.skillId) : undefined;
  const spotlightName = spotlight
    ? (spotlightMetadata?.name ?? effectNames[spotlight.effectType] ?? spotlight.effectType)
    : "";

  return (
    // Full-bleed: layout membungkus halaman di max-w-6xl, sementara etalase
    // kartu butuh lebar penuh supaya satu baris memuat banyak kartu.
    <main className="relative left-1/2 w-screen max-w-[1700px] -translate-x-1/2 px-4 pb-16 pt-6 sm:px-8">

      {/* Baris kepala: banner lebar + kartu sorotan, pola etalase kartu koleksi. */}
      <div className="grid gap-3 lg:grid-cols-[2.4fr_1fr]">
        <section className="relative flex min-h-[12rem] flex-col justify-end overflow-hidden rounded-2xl ring-1 ring-white/10">
          <Image
            src="/images/background/potrait-bg.webp"
            alt=""
            fill
            priority
            sizes="(max-width: 1024px) 100vw, 1100px"
            className="object-cover object-bottom"
          />
          <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-night via-night/70 to-night/20" />
          <div className="relative space-y-3 p-5 sm:p-6">
            <h1 className="max-w-sm font-display text-2xl font-bold leading-tight tracking-tight text-frost sm:text-3xl">
              {t.heroTitle}
            </h1>
            <p className="max-w-sm text-xs text-frost/60">{t.subtitle}</p>
            <a
              href="#catalog"
              className="inline-flex w-fit items-center gap-2 rounded-full bg-frost px-5 py-2 font-display text-sm font-bold text-glacier-ink transition-opacity hover:opacity-85"
            >
              {t.heroCta}
            </a>
          </div>
        </section>

        {/* Sorotan = skill dengan supply paling kecil (dihitung dari sale on-chain). */}
        <section className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-night/55 p-5 backdrop-blur-md">
          <p className="text-[0.7rem] uppercase tracking-[0.2em] text-ice/40">{t.spotlightLabel}</p>
          {spotlight ? (
            <>
              <div className="flex items-center gap-3">
                <SkillMedia
                  imageUrl={spotlightMetadata?.image ?? "/images/card/card-marketplace.webp"}
                  animationUrl={spotlightMetadata?.animation_url}
                  label={spotlightName}
                  className="h-16 w-11 shrink-0 rounded-lg object-cover"
                />
                <div className="min-w-0">
                  <h2 className="truncate font-display text-lg font-bold text-frost">{spotlightName}</h2>
                  {spotlightTier && <SkillTierBadge tier={spotlightTier} />}
                </div>
              </div>
              <p className="text-xs leading-relaxed text-ice/55">{t.spotlightNote}</p>
              <p className="mt-auto font-display text-xl font-bold text-frost">
                {spotlightPrice === undefined ? "—" : `${formatEther(spotlightPrice)} ETH`}
              </p>
            </>
          ) : (
            <div className="animate-pulse space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-16 w-11 shrink-0 rounded-lg bg-white/10" />
                <div className="w-full space-y-2">
                  <div className="h-4 w-2/3 rounded bg-white/10" />
                  <div className="h-3 w-1/3 rounded bg-white/8" />
                </div>
              </div>
              <div className="h-3 w-full rounded bg-white/8" />
              <div className="h-6 w-1/2 rounded bg-white/10" />
            </div>
          )}
        </section>
      </div>

      {/* Judul katalog + tautan kontrak, sejajar seperti header section etalase. */}
      <div id="catalog" className="mt-8 flex items-baseline justify-between gap-3 scroll-mt-24">
        <h2 className="font-display text-2xl font-bold uppercase italic tracking-tight text-frost sm:text-3xl">
          {t.catalogTitle}
        </h2>
        <a
          href={explorerAddressUrl(contractAddresses.marketplace)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-ice/50 transition-colors hover:text-frost"
        >
          {t.viewOnExplorer}
          <LuExternalLink aria-hidden className="size-3.5" />
        </a>
      </div>

      <div className="mt-4 space-y-3">
        {!wallet.isConnected && (
          <p className="rounded-2xl border border-amber-400/30 bg-amber-950/40 px-4 py-2.5 text-center text-xs text-amber-200 backdrop-blur-md">
            {t.connectPrompt}
          </p>
        )}

        {/* Skeleton sebentuk kartu: tinggi grid tidak melompat begitu data
            on-chain masuk, dan jumlahnya menebak katalog yang sudah ada. */}
        {catalog.loading && !catalog.catalog && (
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
            {Array.from({ length: 5 }, (_, index) => (
              <SkillCardSkeleton key={index} />
            ))}
          </ul>
        )}
        {catalog.error && (
          <p
            role="alert"
            className="rounded-2xl border border-red-500/40 bg-red-950/60 px-4 py-2.5 text-sm text-red-200 backdrop-blur-md"
          >
            {t.error}: {catalog.error}
          </p>
        )}
        {sales.error && (
          <p
            role="alert"
            className="rounded-2xl border border-red-500/40 bg-red-950/60 px-4 py-2.5 text-sm text-red-200 backdrop-blur-md"
          >
            {t.error}: {sales.error}
          </p>
        )}

        {catalog.catalog && catalog.catalog.length === 0 && (
          <p className="text-center text-xs text-ice/50">{t.empty}</p>
        )}

        {catalog.catalog && catalog.catalog.length > 0 && (
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
            {catalog.catalog.map((entry) => (
              <SkillMarketCard
                key={entry.skillId}
                entry={entry}
                sale={sales.sales.get(entry.skillId)}
                currentPrice={prices.prices.get(entry.skillId)}
                priceLoading={prices.loading && !prices.prices.has(entry.skillId)}
                metadata={metadata.metadata.get(entry.skillId)}
                ownedBalance={ownership.balances.get(entry.skillId) ?? 0n}
                amount={amountFor(entry.skillId)}
                onAmountChange={(amount) => setAmounts((prev) => ({ ...prev, [entry.skillId]: amount }))}
                walletConnected={wallet.isConnected}
                buyDisabled={anyBuyInFlight}
                buyStatus={statusFor(entry.skillId)}
                buyError={buyingSkillId === entry.skillId ? buy.error : null}
                txHash={buyingSkillId === entry.skillId ? buy.hash : undefined}
                onBuy={() => {
                  // priceOf() is the ONLY correct quote source (contracts/README.md's Dynamic Pricing) - never sale.basePrice.
                  const price = prices.prices.get(entry.skillId);
                  if (price !== undefined) handleBuy(entry.skillId, price);
                }}
                onViewDetails={() => setDetailSkillId(entry.skillId)}
              />
            ))}
          </ul>
        )}

        <p className="pt-1 text-center text-[0.7rem] text-ice/35">{t.refundNote}</p>
      </div>

      <Dialog
        open={detailEntry !== undefined}
        size="lg"
        title={t.detailsTitle}
        onClose={() => setDetailSkillId(null)}
      >
        {detailEntry && (
          <SkillDetail
            entry={detailEntry}
            sale={sales.sales.get(detailEntry.skillId)}
            currentPrice={prices.prices.get(detailEntry.skillId)}
            metadata={metadata.metadata.get(detailEntry.skillId)}
            ownedBalance={ownership.balances.get(detailEntry.skillId) ?? 0n}
            amount={amountFor(detailEntry.skillId)}
            onAmountChange={(amount) => setAmounts((prev) => ({ ...prev, [detailEntry.skillId]: amount }))}
            walletConnected={wallet.isConnected}
            buyDisabled={anyBuyInFlight}
            buyStatus={statusFor(detailEntry.skillId)}
            buyError={buyingSkillId === detailEntry.skillId ? buy.error : null}
            txHash={buyingSkillId === detailEntry.skillId ? buy.hash : undefined}
            onBuy={() => {
              const price = prices.prices.get(detailEntry.skillId);
              if (price !== undefined) handleBuy(detailEntry.skillId, price);
            }}
          />
        )}
      </Dialog>
    </main>
  );
}

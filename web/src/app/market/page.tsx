"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

import SkillMarketCard, { type BuyStatus } from "@/components/SkillMarketCard";
import { useBuySkill } from "@/hooks/useBuySkill";
import { useLocale } from "@/hooks/useLocale";
import { useMarketplaceSales } from "@/hooks/useMarketplaceSales";
import { useSkillCatalog } from "@/hooks/useSkillCatalog";
import { useSkillOwnership } from "@/hooks/useSkillOwnership";
import { useWallet } from "@/hooks/useWallet";
import { strings } from "@/i18n/strings";

/**
 * Primary-sale storefront (contracts/README.md's "Alur pembelian (user)"):
 * on-chain catalog (SkillRegistry) + price/stock (Marketplace.sales) +
 * your balance (SkillCollection.balanceOfBatch), all read-only and visible
 * without a wallet - buying (Marketplace.buy) needs one connected.
 */
export default function MarketPage() {
  const locale = useLocale();
  const t = strings[locale].market;
  const wallet = useWallet();

  const catalog = useSkillCatalog();
  const skillIds = catalog.catalog?.map((entry) => entry.skillId) ?? [];
  const ownership = useSkillOwnership(wallet.address, skillIds);
  const sales = useMarketplaceSales(skillIds);
  const buy = useBuySkill();

  const [amounts, setAmounts] = useState<Record<number, number>>({});
  const [buyingSkillId, setBuyingSkillId] = useState<number | null>(null);

  useEffect(() => {
    if (buy.isConfirmed && buyingSkillId !== null) {
      ownership.reload();
      sales.reload();
    }
    // Only re-run when the tx actually confirms - ownership/sales.reload are stable-enough setters, re-including them would just re-trigger on every catalog refresh.
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

  return (
    <main className="mx-auto max-w-3xl py-4">
      {/* Kartu ber-art potret, pola sama dengan /daily dan /quests. Overlay
          gelap wajib: separuh bawah art itu salju terang. */}
      <section className="relative overflow-hidden rounded-3xl ring-1 ring-white/10">
        <Image
          src="/images/background/potrait-bg.png"
          alt=""
          fill
          priority
          sizes="(max-width: 768px) 100vw, 768px"
          className="object-cover object-center"
        />
        <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-night/55 via-night/70 to-night/90" />

        <div className="relative space-y-5 px-4 py-7 sm:px-6">
          <header className="space-y-2 text-center">
            <h1 className="font-display text-2xl font-bold tracking-tight text-frost sm:text-3xl">
              {t.title} <span aria-hidden>🛍️</span>
            </h1>
            <p className="mx-auto max-w-sm text-sm leading-relaxed text-frost/65">{t.subtitle}</p>
          </header>

          {!wallet.isConnected && (
            <p className="rounded-2xl border border-amber-400/30 bg-amber-950/40 px-4 py-2.5 text-center text-xs text-amber-200 backdrop-blur-md">
              {t.connectPrompt}
            </p>
          )}

          {catalog.loading && <p className="text-center text-xs text-ice/50">{t.loading}</p>}
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
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {catalog.catalog.map((entry) => (
                <SkillMarketCard
                  key={entry.skillId}
                  entry={entry}
                  sale={sales.sales.get(entry.skillId)}
                  ownedBalance={ownership.balances.get(entry.skillId) ?? 0n}
                  amount={amountFor(entry.skillId)}
                  onAmountChange={(amount) => setAmounts((prev) => ({ ...prev, [entry.skillId]: amount }))}
                  walletConnected={wallet.isConnected}
                  buyDisabled={anyBuyInFlight}
                  buyStatus={statusFor(entry.skillId)}
                  buyError={buyingSkillId === entry.skillId ? buy.error : null}
                  txHash={buyingSkillId === entry.skillId ? buy.hash : undefined}
                  onBuy={() => {
                    const price = sales.sales.get(entry.skillId)?.price;
                    if (price !== undefined) handleBuy(entry.skillId, price);
                  }}
                />
              ))}
            </ul>
          )}
        </div>
      </section>
    </main>
  );
}

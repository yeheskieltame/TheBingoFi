"use client";

import { useEffect, useState } from "react";

import SkillMarketCard, { type BuyStatus } from "@/components/SkillMarketCard";
import { useBuySkill } from "@/hooks/useBuySkill";
import { useLocale } from "@/hooks/useLocale";
import { useMarketplaceSales } from "@/hooks/useMarketplaceSales";
import { useSkillCatalog } from "@/hooks/useSkillCatalog";
import { useSkillMetadata } from "@/hooks/useSkillMetadata";
import { useSkillOwnership } from "@/hooks/useSkillOwnership";
import { useSkillPrices } from "@/hooks/useSkillPrices";
import { useWallet } from "@/hooks/useWallet";
import { strings } from "@/i18n/strings";

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

  return (
    <main className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t.title}</h1>
        <p className="text-sm text-slate-400">{t.subtitle}</p>
      </div>

      {!wallet.isConnected && (
        <p className="rounded border border-amber-600 bg-amber-950/40 px-3 py-2 text-sm text-amber-300">
          {t.connectPrompt}
        </p>
      )}

      {catalog.loading && <p className="text-sm text-slate-400">{t.loading}</p>}
      {catalog.error && (
        <p role="alert" className="rounded border border-red-600 bg-red-950/60 px-3 py-2 text-sm text-red-300">
          {t.error}: {catalog.error}
        </p>
      )}
      {sales.error && (
        <p role="alert" className="rounded border border-red-600 bg-red-950/60 px-3 py-2 text-sm text-red-300">
          {t.error}: {sales.error}
        </p>
      )}

      {catalog.catalog && catalog.catalog.length === 0 && <p className="text-sm text-slate-400">{t.empty}</p>}

      {catalog.catalog && catalog.catalog.length > 0 && (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
            />
          ))}
        </ul>
      )}
    </main>
  );
}

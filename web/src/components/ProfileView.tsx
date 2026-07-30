"use client";

import { useMemo, useState } from "react";
import type { Address } from "viem";

import ProfileSkillCard from "@/components/ProfileSkillCard";
import { useLocale } from "@/hooks/useLocale";
import { useMarketplaceSales } from "@/hooks/useMarketplaceSales";
import { useSkillCatalog } from "@/hooks/useSkillCatalog";
import { useSkillOwnership } from "@/hooks/useSkillOwnership";
import { strings } from "@/i18n/strings";
import { truncateAddress } from "@/lib/chain";
import { tierForMaxSupply } from "@/lib/skillTier";

export interface ProfileViewProps {
  /** Already validated with viem's isAddress by the parent Server Component (app/profile/[address]/page.tsx). */
  readonly address: string;
}

/**
 * Public shareable collection profile (CONCEPT.md §7.4b: "/profile/<address>
 * — koleksi skill on-chain ... tiap share = akuisisi gratis"). Read-only and
 * works for ANY address, connected wallet or not - this is someone else's
 * public page as often as it's your own.
 */
export default function ProfileView({ address }: ProfileViewProps) {
  const locale = useLocale();
  const t = strings[locale].profile;

  const catalog = useSkillCatalog();
  const catalogSkillIds = useMemo(() => catalog.catalog?.map((entry) => entry.skillId) ?? [], [catalog.catalog]);
  const ownership = useSkillOwnership(address as Address, catalogSkillIds);
  const sales = useMarketplaceSales(catalogSkillIds);

  const [copied, setCopied] = useState(false);

  const owned = (catalog.catalog ?? []).filter((entry) => (ownership.balances.get(entry.skillId) ?? 0n) > 0n);
  const totalItems = owned.reduce((sum, entry) => sum + (ownership.balances.get(entry.skillId) ?? 0n), 0n);

  // Read window.location fresh at click time rather than stashing it in
  // state on mount - this is a Client Component but still gets an initial
  // SSR pass (no `window`), so seeding state from `window.location.href` in
  // an effect would both trip the set-state-in-effect lint rule and risk a
  // hydration mismatch on the share <a href>s. Reading it inside each click
  // handler needs neither.
  function currentUrl(): string {
    return typeof window !== "undefined" ? window.location.href : "";
  }

  function handleCopyLink() {
    const url = currentUrl();
    if (!url) return;
    navigator.clipboard
      .writeText(url)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => undefined);
  }

  function handleShareX() {
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(t.shareText)}&url=${encodeURIComponent(currentUrl())}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function handleShareTelegram() {
    const url = `https://t.me/share/url?url=${encodeURIComponent(currentUrl())}&text=${encodeURIComponent(t.shareText)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <main className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-white">{t.heading}</h1>
        <p className="font-mono text-sm text-slate-400" title={address}>
          {truncateAddress(address)}
        </p>
        <p className="text-sm text-slate-300">
          {t.totalItemsLabel}: <span className="font-semibold text-white">{totalItems.toString()}</span>
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleCopyLink}
          className="rounded border border-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800"
        >
          {copied ? t.linkCopied : t.copyLink}
        </button>
        <button
          type="button"
          onClick={handleShareX}
          className="rounded border border-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800"
        >
          {t.shareX}
        </button>
        <button
          type="button"
          onClick={handleShareTelegram}
          className="rounded border border-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800"
        >
          {t.shareTelegram}
        </button>
      </div>

      <section className="space-y-3">
        {catalog.loading && <p className="text-sm text-slate-400">{t.loading}</p>}
        {catalog.error && (
          <p role="alert" className="rounded border border-red-600 bg-red-950/60 px-3 py-2 text-sm text-red-300">
            {t.error}: {catalog.error}
          </p>
        )}

        {catalog.catalog && owned.length === 0 && <p className="text-sm text-slate-500">{t.empty}</p>}

        {owned.length > 0 && (
          <ul className="space-y-2">
            {owned.map((entry) => {
              const sale = sales.sales.get(entry.skillId);
              return (
                <ProfileSkillCard
                  key={entry.skillId}
                  entry={entry}
                  balance={ownership.balances.get(entry.skillId) ?? 0n}
                  tier={sale ? tierForMaxSupply(sale.maxSupply) : undefined}
                />
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}

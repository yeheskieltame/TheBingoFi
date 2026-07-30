"use client";

import { useMemo, useState } from "react";
import type { Address } from "viem";

import { LuCopy, LuCheck, LuSend } from "react-icons/lu";
import { FaXTwitter } from "react-icons/fa6";

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
    <main className="mx-auto max-w-3xl space-y-6 py-6">
      {/* Kartu identitas: ini "kartu nama" yang dibagikan keluar, jadi alamat,
          jumlah koleksi, dan tombol share duduk dalam satu blok. */}
      <section className="rounded-3xl border border-white/10 bg-night/55 p-6 backdrop-blur-md">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1">
            <h1 className="font-display text-2xl font-bold tracking-tight text-frost sm:text-3xl">{t.heading}</h1>
            <p className="font-mono text-sm text-ice/50" title={address}>
              {truncateAddress(address)}
            </p>
          </div>

          <div className="text-right">
            <p className="font-display text-3xl font-bold leading-none text-frost">{totalItems.toString()}</p>
            <p className="text-xs uppercase tracking-wide text-ice/45">{t.totalItemsLabel}</p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleCopyLink}
            className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 font-display text-sm font-semibold text-ice transition-colors hover:border-white/35 hover:text-frost"
          >
            {copied ? <LuCheck aria-hidden className="size-4" /> : <LuCopy aria-hidden className="size-4" />}
            {copied ? t.linkCopied : t.copyLink}
          </button>
          <button
            type="button"
            onClick={handleShareX}
            className="inline-flex items-center gap-2 rounded-full bg-frost px-4 py-2 font-display text-sm font-bold text-glacier-ink transition-opacity hover:opacity-85"
          >
            <FaXTwitter aria-hidden className="size-4" />
            {t.shareX}
          </button>
          <button
            type="button"
            onClick={handleShareTelegram}
            className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 font-display text-sm font-semibold text-ice transition-colors hover:border-white/35 hover:text-frost"
          >
            <LuSend aria-hidden className="size-4" />
            {t.shareTelegram}
          </button>
        </div>
      </section>

      <section className="space-y-3">
        {catalog.loading && (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <li
                key={index}
                aria-hidden
                className="aspect-[3/4] animate-pulse rounded-2xl border border-white/10 bg-night/55"
              />
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

        {catalog.catalog && owned.length === 0 && (
          <p className="rounded-2xl border border-white/10 bg-night/45 px-4 py-8 text-center text-sm text-ice/50 backdrop-blur-md">
            {t.empty}
          </p>
        )}

        {owned.length > 0 && (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
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

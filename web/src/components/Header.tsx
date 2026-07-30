"use client";

import Link from "next/link";

import { useLocale } from "@/hooks/useLocale";
import { useWallet } from "@/hooks/useWallet";
import { strings } from "@/i18n/strings";
import { setLocale } from "@/lib/locale";
import { truncateAddress } from "@/lib/chain";

/**
 * Small site-wide nav + wallet connect/disconnect + language switcher,
 * mounted once in app/layout.tsx so it shows up on every page. Not a "dumb"
 * components/ entry in the README's table sense - wallet/locale state is
 * genuinely cross-cutting (not owned by any one page's hook), so it reads
 * wagmi/useLocale directly rather than needing props threaded from a
 * layout-level fetch.
 */
export default function Header() {
  const locale = useLocale();
  const t = strings[locale];
  const wallet = useWallet();

  function toggleLocale() {
    setLocale(locale === "id" ? "en" : "id");
  }

  return (
    <header className="border-b border-slate-800 bg-slate-950/95 text-slate-100">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="text-lg font-bold tracking-tight text-white">
          {t.landing.title}
        </Link>

        <nav aria-label={t.nav.home}>
          <ul className="flex flex-wrap items-center gap-1 text-sm">
            <li>
              <Link href="/play" className="rounded px-2 py-1 hover:bg-slate-800">
                {t.nav.play}
              </Link>
            </li>
            <li>
              <Link href="/daily" className="rounded px-2 py-1 hover:bg-slate-800">
                {t.nav.daily}
              </Link>
            </li>
            <li>
              <Link href="/quests" className="rounded px-2 py-1 hover:bg-slate-800">
                {t.nav.quests}
              </Link>
            </li>
            <li>
              <Link href="/market" className="rounded px-2 py-1 hover:bg-slate-800">
                {t.nav.market}
              </Link>
            </li>
          </ul>
        </nav>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleLocale}
            className="rounded border border-slate-700 px-2 py-1 text-xs font-semibold text-slate-300 hover:bg-slate-800"
            aria-label="Switch language"
          >
            {t.nav.langToggle}
          </button>

          {wallet.isConnected ? (
            <div className="flex items-center gap-2">
              {wallet.wrongNetwork && (
                <button
                  type="button"
                  onClick={wallet.switchToGiwaSepolia}
                  disabled={wallet.isSwitchingNetwork}
                  className="rounded bg-amber-600 px-2 py-1 text-xs font-semibold text-white hover:bg-amber-500 disabled:opacity-60"
                >
                  {wallet.isSwitchingNetwork ? t.wallet.switching : t.wallet.switchNetwork}
                </button>
              )}
              <span
                className="rounded border border-slate-700 px-2 py-1 font-mono text-xs text-slate-200"
                title={wallet.address}
              >
                {truncateAddress(wallet.address ?? "")}
              </span>
              <button
                type="button"
                onClick={wallet.disconnect}
                className="rounded border border-slate-700 px-2 py-1 text-xs font-semibold text-slate-300 hover:bg-slate-800"
              >
                {t.wallet.disconnect}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={wallet.connect}
              disabled={wallet.isConnecting || !wallet.hasConnector}
              title={wallet.hasConnector ? undefined : t.wallet.notInstalled}
              className="rounded bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {wallet.isConnecting ? t.wallet.connecting : t.wallet.connect}
            </button>
          )}
        </div>
      </div>
      {!wallet.hasConnector && (
        <p className="mx-auto max-w-5xl px-4 pb-2 text-xs text-amber-400">{t.wallet.notInstalled}</p>
      )}
    </header>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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
/**
 * Nav links, in display order - satu sumber supaya markup-nya tidak diulang 4x.
 * "Play" menunjuk ke landing (form nickname + mode ada di sana, /play sendiri
 * langsung bikin/masuk room), tapi `also` membuatnya tetap menyala saat pemain
 * sudah berada di dalam room.
 */
const NAV_ITEMS = [
  { href: "/", key: "play", also: "/play" },
  { href: "/daily", key: "daily" },
  { href: "/quests", key: "quests" },
  { href: "/market", key: "market" },
] as const;

export default function Header() {
  const locale = useLocale();
  const t = strings[locale];
  const wallet = useWallet();
  const pathname = usePathname();

  function toggleLocale() {
    setLocale(locale === "id" ? "en" : "id");
  }

  return (
    <header className="sticky top-0 z-50 border-b border-white/5 bg-night/85 text-frost backdrop-blur-md">
      {/* 3 kolom (logo | nav tengah | aksi) mengikuti pola nav referensi - di mobile jatuh ke stack tengah. */}
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-3 px-4 py-3 sm:px-6 md:grid md:grid-cols-[1fr_auto_1fr] md:gap-4">
        {/* Logo tetap link Home, tanpa indikator aktif - entri nav "Play" yang
            menandai "/" supaya tidak ada dua penanda menyala bersamaan. */}
        <Link
          href="/"
          title={t.nav.home}
          className="font-display text-2xl font-bold tracking-tight text-frost transition-opacity hover:opacity-80 md:justify-self-start"
        >
          {t.landing.title}
        </Link>

        <nav aria-label={t.nav.home} className="md:justify-self-center">
          <ul className="flex flex-wrap items-center justify-center gap-1">
            {NAV_ITEMS.map((item) => {
              // startsWith menangkap sub-route (mis. /market/xyz nanti ikut menyala);
              // `also` menangkap halaman lain yang masih "milik" entri ini (/play).
              const matches = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
              const active = matches(item.href) || ("also" in item && matches(item.also));
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`relative block rounded-full px-3 py-1.5 font-display text-base transition-colors after:absolute after:inset-x-3 after:-bottom-0.5 after:h-0.5 after:rounded-full after:transition-colors after:content-[''] ${
                      active
                        ? "font-bold text-frost after:bg-frost"
                        : "font-semibold text-ice/60 after:bg-transparent hover:text-frost"
                    }`}
                  >
                    {t.nav[item.key]}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="flex items-center gap-2 md:justify-self-end">
          <button
            type="button"
            onClick={toggleLocale}
            className="flex h-9 items-center gap-1.5 rounded-full border border-white/15 pl-2.5 pr-3 text-ice transition-colors hover:border-white/30 hover:text-frost"
            aria-label={t.nav.langSwitch}
            title={t.nav.langSwitch}
          >
            {/* Flag emoji: di Windows Chrome bendera tidak dirender (jadi huruf "GB"/"ID"),
                makanya kode bahasa tetap ditampilkan di sebelahnya, bukan hanya bendera. */}
            <span aria-hidden className="text-base leading-none">
              {t.nav.langFlag}
            </span>
            <span className="font-display text-sm font-bold leading-none">{t.nav.langToggle}</span>
          </button>

          {wallet.isConnected ? (
            <>
              {wallet.wrongNetwork && (
                <button
                  type="button"
                  onClick={wallet.switchToGiwaSepolia}
                  disabled={wallet.isSwitchingNetwork}
                  className="flex h-9 items-center rounded-full bg-amber-500 px-4 font-display text-sm font-bold text-night transition-colors hover:bg-amber-400 disabled:opacity-60"
                >
                  {wallet.isSwitchingNetwork ? t.wallet.switching : t.wallet.switchNetwork}
                </button>
              )}
              <span
                className="hidden h-9 items-center rounded-full border border-white/15 px-3 font-mono text-xs text-ice sm:flex"
                title={wallet.address}
              >
                {truncateAddress(wallet.address ?? "")}
              </span>
              <button
                type="button"
                onClick={wallet.disconnect}
                className="flex h-9 items-center rounded-full border border-white/15 px-4 font-display text-sm font-semibold text-ice transition-colors hover:border-white/30 hover:text-frost"
              >
                {t.wallet.disconnect}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={wallet.connect}
              disabled={wallet.isConnecting || !wallet.hasConnector}
              title={wallet.hasConnector ? undefined : t.wallet.notInstalled}
              className="flex h-9 items-center rounded-full bg-frost px-5 font-display text-sm font-bold text-glacier-ink transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {wallet.isConnecting ? t.wallet.connecting : t.wallet.connect}
            </button>
          )}
        </div>
      </div>
      {!wallet.hasConnector && (
        <p className="mx-auto max-w-6xl px-4 pb-2 text-center text-xs text-amber-300 sm:px-6">{t.wallet.notInstalled}</p>
      )}
    </header>
  );
}

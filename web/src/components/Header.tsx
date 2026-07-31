"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { LuChevronDown, LuLogOut, LuUser } from "react-icons/lu";

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
  { href: "/plaza", key: "plaza" },
] as const;

export default function Header() {
  const locale = useLocale();
  const t = strings[locale];
  const wallet = useWallet();
  const pathname = usePathname();

  /** Menu wallet (profil + putuskan). Dulu address dan Disconnect dua pill
   *  terpisah; digabung supaya bar kanan tidak sesak dan aksinya terkelompok. */
  /** Menyimpan pathname saat menu dibuka; menu dianggap tertutup begitu
   *  pathname berubah (mis. klik "Profilku") — turunan, bukan efek. */
  const [openedAtPath, setOpenedAtPath] = useState<string | null>(null);
  const walletMenuOpen = openedAtPath === pathname;
  const setWalletMenuOpen = useCallback(
    (next: boolean) => setOpenedAtPath(next ? pathname : null),
    [pathname],
  );
  const walletMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!walletMenuOpen) return;
    function onPointerDown(event: PointerEvent) {
      if (!walletMenuRef.current?.contains(event.target as Node)) setWalletMenuOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setWalletMenuOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [walletMenuOpen, setWalletMenuOpen]);

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
          className="flex items-center gap-2 font-display text-2xl font-bold tracking-tight text-frost transition-opacity hover:opacity-80 md:justify-self-start"
        >
          {/* Mark dekoratif: wordmark di sebelahnya sudah jadi nama aksesibel link. */}
          <Image src="/logo.svg" alt="" aria-hidden width={28} height={28} priority className="size-7" />
          {t.landing.title}
        </Link>

        <nav aria-label={t.nav.home} className="md:justify-self-center">
          <ul className="flex flex-wrap items-center justify-center gap-0.5 lg:gap-1">
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
                    className={`relative block whitespace-nowrap rounded-full px-2.5 py-1.5 font-display text-[0.95rem] transition-colors lg:px-3 lg:text-base after:absolute after:inset-x-3 after:-bottom-0.5 after:h-0.5 after:rounded-full after:transition-colors after:content-[''] ${
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

        <div className="flex shrink-0 items-center gap-1.5 md:justify-self-end">
          <button
            type="button"
            onClick={toggleLocale}
            className="flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-white/15 pl-2.5 pr-3 text-ice transition-colors hover:border-white/30 hover:text-frost"
            aria-label={t.nav.langSwitch}
            title={t.nav.langSwitch}
          >
            {/* Menandakan bahasa yang SEDANG aktif; aksinya ("ganti ke ...") ada di
                aria-label/title. Flag emoji tidak dirender di Windows Chrome (jadi
                huruf "GB"/"ID"), makanya kode bahasa tetap ditampilkan di sebelahnya. */}
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
                  className="flex h-9 shrink-0 items-center whitespace-nowrap rounded-full bg-amber-500 px-4 font-display text-sm font-bold text-night transition-colors hover:bg-amber-400 disabled:opacity-60"
                >
                  {wallet.isSwitchingNetwork ? t.wallet.switching : t.wallet.switchNetwork}
                </button>
              )}
              {/* Satu pill address + menu: profil dan putuskan jadi isi dropdown. */}
              <div ref={walletMenuRef} className="relative">
                <button
                  type="button"
                  onClick={() => setWalletMenuOpen(!walletMenuOpen)}
                  aria-haspopup="menu"
                  aria-expanded={walletMenuOpen}
                  className="flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-white/15 pl-3 pr-2 font-mono text-xs text-ice transition-colors hover:border-white/30 hover:text-frost"
                >
                  {truncateAddress(wallet.address ?? "")}
                  <LuChevronDown
                    aria-hidden
                    className={`size-3.5 transition-transform ${walletMenuOpen ? "rotate-180" : ""}`}
                  />
                </button>

                {walletMenuOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 top-11 z-50 w-48 overflow-hidden rounded-2xl border border-white/12 bg-night/95 py-1 shadow-2xl shadow-black/60 backdrop-blur-md"
                  >
                    <Link
                      role="menuitem"
                      href={`/profile/${wallet.address}`}
                      className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-ice transition-colors hover:bg-white/10 hover:text-frost"
                    >
                      <LuUser aria-hidden className="size-4" />
                      {t.nav.profile}
                    </Link>
                    <button
                      role="menuitem"
                      type="button"
                      onClick={() => {
                        setWalletMenuOpen(false);
                        wallet.disconnect();
                      }}
                      className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-ice transition-colors hover:bg-white/10 hover:text-frost"
                    >
                      <LuLogOut aria-hidden className="size-4" />
                      {t.wallet.disconnect}
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <button
              type="button"
              onClick={wallet.connect}
              disabled={wallet.isConnecting || !wallet.hasConnector}
              title={wallet.hasConnector ? undefined : t.wallet.notInstalled}
              className="flex h-9 shrink-0 items-center whitespace-nowrap rounded-full bg-frost px-5 font-display text-sm font-bold text-glacier-ink transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-50"
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

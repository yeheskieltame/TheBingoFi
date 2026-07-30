"use client";

import { LuCheck, LuCopy, LuSend } from "react-icons/lu";
import { FaXTwitter } from "react-icons/fa6";

import { useLocale } from "@/hooks/useLocale";
import { strings } from "@/i18n/strings";

export interface DailyResultProps {
  readonly number: number;
  readonly score: number;
  readonly callsToBingo: number;
  /** Teks share ala Wordle dari server (headline + grid emoji) - dipakai untuk salin & share. */
  readonly shareCard: string;
  /** 25 sel, true = ter-mark saat BINGO tercapai. Sumber grid visual di kartu. */
  readonly markedAtBingo: readonly boolean[];
  readonly copied: boolean;
  readonly onCopy: () => void;
}

/**
 * Dumb: hasil Daily Challenge sebagai KARTU VISUAL yang layak di-screenshot
 * (BRIEF.md §4: share card = deliverable utama halaman ini). Grid 5x5-nya
 * memakai warna, bukan emoji - versi emoji tetap dipakai untuk teks yang
 * disalin/di-share, karena itu yang bisa ditempel ke mana saja.
 *
 * Board angkanya sendiri sengaja TIDAK ditampilkan: sama seperti Wordle, hasil
 * boleh dipamerkan tanpa membocorkan jawaban ke yang belum main hari ini.
 */
export default function DailyResult({
  number,
  score,
  callsToBingo,
  shareCard,
  markedAtBingo,
  copied,
  onCopy,
}: DailyResultProps) {
  const locale = useLocale();
  const t = strings[locale].daily.result;
  const brand = strings[locale].landing.title;

  function shareUrl(): string {
    return typeof window !== "undefined" ? `${window.location.origin}/daily` : "";
  }

  function handleShareX() {
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareCard)}&url=${encodeURIComponent(shareUrl())}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function handleShareTelegram() {
    const url = `https://t.me/share/url?url=${encodeURIComponent(shareUrl())}&text=${encodeURIComponent(shareCard)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="space-y-4">
      {/* Kartu share: satu blok utuh, aman di-crop screenshot apa pun. */}
      <section className="mx-auto max-w-xs overflow-hidden rounded-3xl bg-gradient-to-b from-glacier-deep/60 to-night p-5 text-center ring-1 ring-frost/25">
        <p className="font-display text-xs font-bold uppercase tracking-[0.25em] text-frost/70">{brand}</p>
        <p className="mt-0.5 font-display text-lg font-bold text-frost">#{number}</p>

        <div className="mx-auto mt-4 grid w-fit grid-cols-5 gap-1.5" aria-hidden>
          {markedAtBingo.map((marked, index) => (
            <span
              key={index}
              className={`size-8 rounded-md ${marked ? "bg-frost shadow-lg shadow-frost/20" : "bg-white/10"}`}
            />
          ))}
        </div>

        <dl className="mt-4 flex items-end justify-center gap-6">
          <div>
            <dt className="text-[0.65rem] uppercase tracking-wide text-frost/50">{t.score}</dt>
            <dd className="font-display text-3xl font-bold leading-none text-frost">{score}</dd>
          </div>
          <div>
            <dt className="text-[0.65rem] uppercase tracking-wide text-frost/50">{t.callsToBingo}</dt>
            <dd className="font-display text-3xl font-bold leading-none text-frost">{callsToBingo}</dd>
          </div>
        </dl>
      </section>

      <p className="text-center text-xs text-ice/45">{t.shareHint}</p>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={handleShareX}
          className="inline-flex items-center gap-2 rounded-full bg-frost px-5 py-2 font-display text-sm font-bold text-glacier-ink transition-opacity hover:opacity-85"
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
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 font-display text-sm font-semibold text-ice transition-colors hover:border-white/35 hover:text-frost"
        >
          {copied ? <LuCheck aria-hidden className="size-4" /> : <LuCopy aria-hidden className="size-4" />}
          {copied ? strings[locale].common.copied : t.copyText}
        </button>
      </div>
    </div>
  );
}

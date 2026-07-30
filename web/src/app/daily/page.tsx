"use client";

import Image from "next/image";
import { useState } from "react";

import DailyLeaderboard from "@/components/DailyLeaderboard";
import DailyResult from "@/components/DailyResult";
import DraftBoard from "@/components/DraftBoard";
import { useDailyChallenge } from "@/hooks/useDailyChallenge";
import { useDraftBoard } from "@/hooks/useDraftBoard";
import { useLocale } from "@/hooks/useLocale";
import { strings } from "@/i18n/strings";
import { getStoredNickname, setStoredNickname } from "@/lib/storage";

export default function DailyPage() {
  const locale = useLocale();
  const t = strings[locale].daily;
  const daily = useDailyChallenge();
  const draft = useDraftBoard();
  const [nickname, setNickname] = useState(() => getStoredNickname());
  const [copied, setCopied] = useState(false);

  function handlePlay(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = nickname.trim();
    if (!trimmed || !draft.validation.valid) return;
    setStoredNickname(trimmed);
    daily.play(trimmed, draft.numbers);
  }

  function handleCopy() {
    if (!daily.result) return;
    navigator.clipboard.writeText(daily.result.shareCard).then(() => {
      setCopied(true);
    });
  }

  return (
    <main className="mx-auto max-w-md space-y-6 py-4 text-center">
      {/* Kartu utama: art potret jadi latar KARTU (bukan latar halaman).
          Overlay gelap bergradasi wajib - separuh bawah art itu salju terang,
          teks frost tidak akan terbaca tanpa itu. */}
      <section className="relative overflow-hidden rounded-3xl ring-1 ring-white/10">
        <Image
          src="/images/background/potrait-bg.png"
          alt=""
          fill
          priority
          sizes="(max-width: 640px) 100vw, 448px"
          className="object-cover object-center"
        />
        <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-night/55 via-night/70 to-night/90" />

        <div className="relative space-y-5 px-4 py-7 sm:px-6">
          <header className="space-y-2.5">
            {daily.today ? (
              <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-night/40 px-3 py-1 font-display text-xs font-semibold text-ice backdrop-blur-md">
                {t.challengeNumber} #{daily.today.number}
                <span className="text-ice/50">{daily.today.date}</span>
              </p>
            ) : !daily.error ? (
              <p className="text-xs text-ice/50">{strings[locale].common.loading}</p>
            ) : null}

            <h1 className="font-display text-2xl font-bold tracking-tight text-frost sm:text-3xl">
              {t.title} <span aria-hidden>❄️</span>
            </h1>
            <p className="mx-auto max-w-xs text-sm leading-relaxed text-frost/65">{t.subtitle}</p>
          </header>

          {daily.error && (
            <p
              role="alert"
              className="mx-auto max-w-md rounded-2xl border border-red-500/40 bg-red-950/60 px-4 py-2.5 text-sm text-red-200 backdrop-blur-md"
            >
              {daily.error}
            </p>
          )}

          {!daily.result && (
            <form onSubmit={handlePlay} className="flex flex-col items-center gap-5">
              <DraftBoard
                numbers={draft.numbers}
                selectedIndex={draft.selectedIndex}
                onSelectCell={draft.selectCell}
                onSwapCells={draft.swapCells}
                onShuffle={draft.shuffle}
                valid={draft.validation.valid}
                validationError={draft.validation.error}
              />

              <div className="flex w-full max-w-xs flex-col items-center gap-2.5">
                <label htmlFor="daily-nickname" className="sr-only">
                  {t.nicknameLabel}
                </label>
                <input
                  id="daily-nickname"
                  value={nickname}
                  onChange={(event) => setNickname(event.target.value)}
                  placeholder={t.nicknameLabel}
                  className="w-full rounded-full border border-white/15 bg-night/40 px-4 py-2 text-center font-display text-sm font-medium text-frost backdrop-blur-md placeholder:text-ice/40 focus:border-white/35 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={daily.pending || !draft.validation.valid || !nickname.trim()}
                  className="rounded-full bg-glacier-deep px-8 py-2 font-display text-base font-bold text-frost shadow-lg shadow-night/40 transition-colors hover:bg-glacier disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {daily.pending ? strings[locale].common.loading : t.play}
                </button>
              </div>
            </form>
          )}

          {daily.result && (
            <DailyResult
              number={daily.result.number}
              score={daily.result.score}
              callsToBingo={daily.result.callsToBingo}
              shareCard={daily.result.shareCard}
              copied={copied}
              onCopy={handleCopy}
            />
          )}
        </div>
      </section>

      {daily.leaderboard ? (
        <DailyLeaderboard entries={daily.leaderboard} />
      ) : (
        !daily.error && <p className="text-sm text-ice/40">{strings[locale].common.loading}</p>
      )}
    </main>
  );
}

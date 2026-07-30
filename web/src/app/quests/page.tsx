"use client";

import QuestList from "@/components/QuestList";
import { useLocale } from "@/hooks/useLocale";
import { useQuests } from "@/hooks/useQuests";
import { strings } from "@/i18n/strings";

export default function QuestsPage() {
  const locale = useLocale();
  const t = strings[locale].quests;
  const { quests, progress, playerId, error } = useQuests();

  return (
    <main className="mx-auto max-w-2xl py-8">
      {/* "System window": bingkai ganda + sudut bracket, bukan kartu biasa -
          quest log memang lebih enak dibaca sebagai panel HUD daripada daftar
          kartu, dan ini juga membedakannya dari /market yang art-heavy. */}
      <section className="relative rounded-lg border border-glacier/50 bg-night/75 p-1.5 shadow-[0_0_45px_-12px_rgba(58,124,184,0.55)] backdrop-blur-md">
        <div className="relative rounded border border-glacier/25 px-5 py-8 sm:px-10">
          {/* Sudut bracket */}
          <span aria-hidden className="pointer-events-none absolute left-1.5 top-1.5 size-4 border-l-2 border-t-2 border-frost/70" />
          <span aria-hidden className="pointer-events-none absolute right-1.5 top-1.5 size-4 border-r-2 border-t-2 border-frost/70" />
          <span aria-hidden className="pointer-events-none absolute bottom-1.5 left-1.5 size-4 border-b-2 border-l-2 border-frost/70" />
          <span aria-hidden className="pointer-events-none absolute bottom-1.5 right-1.5 size-4 border-b-2 border-r-2 border-frost/70" />

          <header className="mb-5 space-y-3 text-center">
            <div className="mx-auto flex w-fit items-stretch border border-glacier/50">
              <span
                aria-hidden
                className="grid w-12 place-items-center border-r border-glacier/50 font-display text-xl font-bold text-frost"
              >
                !
              </span>
              <h1 className="px-6 py-3 font-display text-xl font-bold uppercase tracking-[0.3em] text-frost sm:text-2xl">
                {t.panelTitle}
              </h1>
            </div>
            <p className="text-sm text-ice/50">{t.intro}</p>
          </header>

          {error && (
            <p
              role="alert"
              className="mb-4 border border-red-500/40 bg-red-950/50 px-4 py-2.5 text-sm text-red-200"
            >
              {error}
            </p>
          )}

          {!quests && !error && <p className="text-center text-xs text-ice/50">{t.loading}</p>}

          {quests &&
            (quests.length === 0 ? (
              <p className="text-center text-xs text-ice/50">-</p>
            ) : (
              <QuestList quests={quests} progress={progress} />
            ))}

          <footer className="mt-6 space-y-3 border-t border-white/10 pt-4 text-center">
            <p className="text-xs leading-relaxed text-ice/45">
              {t.warning.split(".")[0]}.
              <span className="text-amber-300"> {t.warning.split(".").slice(1).join(".").trim()}</span>
            </p>
            {!playerId && <p className="text-xs text-ice/50">{t.noPlayerYet}</p>}
          </footer>
        </div>
      </section>
    </main>
  );
}

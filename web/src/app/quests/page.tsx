"use client";

import Image from "next/image";

import QuestList from "@/components/QuestList";
import { useLocale } from "@/hooks/useLocale";
import { useQuests } from "@/hooks/useQuests";
import { strings } from "@/i18n/strings";

export default function QuestsPage() {
  const locale = useLocale();
  const t = strings[locale].quests;
  const { quests, progress, playerId, error } = useQuests();

  return (
    <main className="mx-auto max-w-lg py-4">
      {/* Kartu ber-art potret, pola sama dengan /daily. Overlay gelap wajib:
          separuh bawah art itu salju terang, teks frost tidak akan terbaca. */}
      <section className="relative overflow-hidden rounded-3xl ring-1 ring-white/10">
        <Image
          src="/images/background/potrait-bg.png"
          alt=""
          fill
          priority
          sizes="(max-width: 640px) 100vw, 512px"
          className="object-cover object-center"
        />
        <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-night/55 via-night/70 to-night/90" />

        <div className="relative space-y-5 px-4 py-7 sm:px-6">
          <h1 className="text-center font-display text-2xl font-bold tracking-tight text-frost sm:text-3xl">
            {t.title} <span aria-hidden>🎯</span>
          </h1>

          {error && (
            <p
              role="alert"
              className="rounded-2xl border border-red-500/40 bg-red-950/60 px-4 py-2.5 text-sm text-red-200 backdrop-blur-md"
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

          {!playerId && <p className="text-center text-xs text-ice/50">{t.noPlayerYet}</p>}
        </div>
      </section>
    </main>
  );
}

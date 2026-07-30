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
    <main className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold">{t.title}</h1>

      {error && (
        <p role="alert" className="rounded border border-red-600 bg-red-950/60 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}
      {!quests && !error && <p className="text-sm text-slate-500">{t.loading}</p>}
      {quests && (quests.length === 0 ? <p className="text-sm text-slate-400">-</p> : <QuestList quests={quests} progress={progress} />)}
      {!playerId && <p className="text-sm text-slate-400">{t.noPlayerYet}</p>}
    </main>
  );
}

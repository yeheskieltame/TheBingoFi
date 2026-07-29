"use client";

import QuestList from "@/components/QuestList";
import { useQuests } from "@/hooks/useQuests";
import { strings } from "@/i18n/strings";

const locale = "id";

export default function QuestsPage() {
  const t = strings[locale].quests;
  const { quests, progress, playerId, error } = useQuests();

  return (
    <main>
      <h1>{t.title}</h1>

      {error && <p role="alert">{error}</p>}
      {!quests && <p>{t.loading}</p>}
      {quests && <QuestList quests={quests} progress={progress} />}
      {!playerId && <p>{t.noPlayerYet}</p>}
    </main>
  );
}

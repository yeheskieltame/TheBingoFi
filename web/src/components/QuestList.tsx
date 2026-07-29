import type { QuestDef, QuestProgress } from "@/lib/api";
import { strings } from "@/i18n/strings";

const locale = "id";

export interface QuestListProps {
  readonly quests: readonly QuestDef[];
  readonly progress: readonly QuestProgress[] | null;
}

/** Dumb: GET /quests catalog as a plain table, with GET /quests/progress/:playerId folded in per-row when available. */
export default function QuestList({ quests, progress }: QuestListProps) {
  const t = strings[locale].quests.table;

  return (
    <table>
      <thead>
        <tr>
          <th scope="col">{t.title}</th>
          <th scope="col">{t.target}</th>
          <th scope="col">{t.window}</th>
          <th scope="col">{t.reward}</th>
          <th scope="col">{t.progress}</th>
        </tr>
      </thead>
      <tbody>
        {quests.map((quest) => {
          const questProgress = progress?.find((entry) => entry.questId === quest.id);
          return (
            <tr key={quest.id}>
              <td>{quest.title}</td>
              <td>{quest.target}</td>
              <td>{quest.window}</td>
              <td>{quest.reward.xp}</td>
              <td>
                {questProgress ? `${questProgress.count}/${quest.target}${questProgress.completed ? " ✓" : ""}` : "-"}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

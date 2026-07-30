import type { QuestDef, QuestProgress } from "@/lib/api";
import { useLocale } from "@/hooks/useLocale";
import { strings } from "@/i18n/strings";

export interface QuestListProps {
  readonly quests: readonly QuestDef[];
  readonly progress: readonly QuestProgress[] | null;
}

/** Dumb: GET /quests catalog as a list with a simple progress bar per quest, with GET /quests/progress/:playerId folded in per-row when available. */
export default function QuestList({ quests, progress }: QuestListProps) {
  const locale = useLocale();
  const t = strings[locale].quests.table;

  return (
    <ul className="space-y-2">
      {quests.map((quest) => {
        const questProgress = progress?.find((entry) => entry.questId === quest.id);
        const count = questProgress?.count ?? 0;
        const pct = quest.target > 0 ? Math.min(100, Math.round((count / quest.target) * 100)) : 0;
        const completed = questProgress?.completed ?? false;

        return (
          <li key={quest.id} className="rounded border border-slate-800 bg-slate-900/60 p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-semibold">
                {completed && "✓ "}
                {quest.title}
              </span>
              <span className="text-xs text-slate-400">
                {t.window}: {quest.window} · {t.reward}: {quest.reward.xp}
              </span>
            </div>
            <div
              className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-800"
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${t.progress}: ${quest.title}`}
            >
              <div
                className={`h-full rounded-full ${completed ? "bg-emerald-500" : "bg-indigo-500"}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-slate-400">
              {t.progress}: {count}/{quest.target}
            </p>
          </li>
        );
      })}
    </ul>
  );
}

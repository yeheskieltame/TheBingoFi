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
    <ul className="space-y-2.5">
      {quests.map((quest) => {
        const questProgress = progress?.find((entry) => entry.questId === quest.id);
        const count = questProgress?.count ?? 0;
        const pct = quest.target > 0 ? Math.min(100, Math.round((count / quest.target) * 100)) : 0;
        const completed = questProgress?.completed ?? false;

        return (
          <li
            key={quest.id}
            className="rounded-2xl border border-white/10 bg-night/40 p-3.5 backdrop-blur-md"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-display text-sm font-bold text-frost">
                {completed && "✓ "}
                {quest.title}
              </span>
              <span className="text-xs text-ice/55">
                {quest.window} · {quest.reward.xp} {t.reward}
              </span>
            </div>
            <div
              className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-white/10"
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${t.progress}: ${quest.title}`}
            >
              <div
                className={`h-full rounded-full transition-[width] ${completed ? "bg-frost" : "bg-glacier"}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="mt-1.5 text-right font-display text-xs font-semibold text-ice/50">
              {count}/{quest.target}
            </p>
          </li>
        );
      })}
    </ul>
  );
}

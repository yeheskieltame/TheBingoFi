import type { QuestDef, QuestProgress } from "@/lib/api";
import { useLocale } from "@/hooks/useLocale";
import { strings } from "@/i18n/strings";

export interface QuestListProps {
  readonly quests: readonly QuestDef[];
  readonly progress: readonly QuestProgress[] | null;
}

/** Urutan tampil grup; window lain (kalau server menambah) menyusul di belakang. */
const WINDOW_ORDER = ["daily", "weekly", "season"] as const;

/**
 * Dumb: GET /quests catalog dikelompokkan per window (harian/mingguan/musim)
 * dengan progress bar per quest, GET /quests/progress/:playerId dilipat ke tiap
 * baris kalau tersedia. Dikelompokkan karena "apa yang harus kukerjakan hari
 * ini" adalah pertanyaan pertama pemain - daftar rata membuat quest mingguan
 * dan harian terlihat sama mendesaknya.
 */
export default function QuestList({ quests, progress }: QuestListProps) {
  const locale = useLocale();
  const t = strings[locale].quests;
  const tt = t.table;

  const windowLabel: Record<string, string> = {
    daily: t.windowDaily,
    weekly: t.windowWeekly,
    season: t.windowSeason,
  };

  const windows = [
    ...WINDOW_ORDER.filter((w) => quests.some((q) => q.window === w)),
    ...Array.from(new Set(quests.map((q) => q.window))).filter(
      (w) => !WINDOW_ORDER.includes(w as (typeof WINDOW_ORDER)[number]),
    ),
  ];

  function progressFor(quest: QuestDef) {
    const entry = progress?.find((p) => p.questId === quest.id);
    const count = entry?.count ?? 0;
    return {
      count,
      completed: entry?.completed ?? false,
      pct: quest.target > 0 ? Math.min(100, Math.round((count / quest.target) * 100)) : 0,
    };
  }

  return (
    <div className="space-y-5">
      {windows.map((window) => {
        const group = quests.filter((quest) => quest.window === window);
        const doneCount = group.filter((quest) => progressFor(quest).completed).length;

        return (
          <section key={window} className="space-y-2">
            <div className="flex items-baseline justify-between gap-2 px-1">
              <h2 className="font-display text-sm font-bold uppercase tracking-wide text-frost/80">
                {windowLabel[window] ?? window}
              </h2>
              <span className="text-xs text-ice/45">
                {doneCount}/{group.length} {t.groupDone}
              </span>
            </div>

            <ul className="space-y-2">
              {group.map((quest) => {
                const { count, completed, pct } = progressFor(quest);

                return (
                  <li
                    key={quest.id}
                    className={`rounded-2xl border p-3.5 backdrop-blur-md transition-colors ${
                      completed ? "border-frost/40 bg-frost/10" : "border-white/10 bg-night/45"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {/* Status bulat: tuntas = putih salju bercentang, belum = cincin kosong. */}
                      <span
                        aria-hidden
                        className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-[0.7rem] font-bold ${
                          completed ? "bg-frost text-glacier-ink" : "border border-white/20 text-transparent"
                        }`}
                      >
                        ✓
                      </span>

                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                          <span className="font-display text-sm font-bold text-frost">{quest.title}</span>
                          <span className="rounded-full bg-white/8 px-2 py-0.5 font-display text-[0.7rem] font-bold text-ice">
                            +{quest.reward.xp} {tt.reward}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <div
                            className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10"
                            role="progressbar"
                            aria-valuenow={pct}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-label={`${tt.progress}: ${quest.title}`}
                          >
                            <div
                              className={`h-full rounded-full transition-[width] duration-500 ${
                                completed ? "bg-frost" : "bg-glacier"
                              }`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="shrink-0 font-display text-xs font-bold text-ice/50">
                            {completed ? t.done : `${count}/${quest.target}`}
                          </span>
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

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
 * Dumb: katalog GET /quests dirender sebagai "system window" - satu blok per
 * window (harian/mingguan/musim), tiap barisnya `nama … [n/target] ☑`.
 * Progres dari GET /quests/progress/:playerId dilipat per baris.
 *
 * Bentuk baris sengaja tabular (angka mono di kurung siku + kotak centang):
 * pemain memindai "apa yang kurang" secara vertikal, dan angka rata kanan
 * jauh lebih cepat dibaca daripada bar warna-warni.
 */
export default function QuestList({ quests, progress }: QuestListProps) {
  const locale = useLocale();
  const t = strings[locale].quests;

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
    return { count, completed: entry?.completed ?? false };
  }

  return (
    <div className="space-y-7">
      {windows.map((window) => {
        const group = quests.filter((quest) => quest.window === window);
        const doneCount = group.filter((quest) => progressFor(quest).completed).length;

        return (
          <section key={window} className="space-y-3">
            {/* Sub-judul bergaris bawah pendek, seperti "GOAL" di panel misi game. */}
            <div className="flex items-baseline justify-center gap-2">
              <h2 className="border-b border-glacier/60 pb-1.5 font-display text-base font-bold uppercase tracking-[0.25em] text-frost">
                {windowLabel[window] ?? window}
              </h2>
              <span className="font-mono text-xs text-ice/40">
                {doneCount}/{group.length}
              </span>
            </div>

            <ul className="space-y-1.5">
              {group.map((quest) => {
                const { count, completed } = progressFor(quest);

                return (
                  <li key={quest.id} className="flex items-center gap-3 px-1 py-2.5">
                    <span className={`min-w-0 flex-1 truncate text-base ${completed ? "text-frost" : "text-frost/75"}`}>
                      {quest.title}
                    </span>

                    {/* Garis titik-titik penghubung: menjaga angka tetap rata kanan
                        walau panjang judul quest berbeda-beda. */}
                    <span aria-hidden className="h-px flex-1 border-b border-dotted border-white/15" />

                    <span className="shrink-0 font-mono text-base text-ice/70">
                      [{count}/{quest.target}]
                    </span>

                    <span
                      aria-hidden
                      className={`grid size-6 shrink-0 place-items-center rounded border text-sm font-bold ${
                        completed
                          ? "border-emerald-400/70 bg-emerald-400/15 text-emerald-300"
                          : "border-white/20 text-transparent"
                      }`}
                    >
                      ✓
                    </span>
                    <span className="sr-only">
                      {completed ? t.done : `${count}/${quest.target}`} · +{quest.reward.xp} {t.table.reward}
                    </span>

                    <span className="w-16 shrink-0 text-right font-mono text-xs text-ice/35">
                      +{quest.reward.xp}xp
                    </span>
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

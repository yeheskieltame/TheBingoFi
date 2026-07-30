import type { DailyLeaderboardEntry } from "@/lib/api";
import { useLocale } from "@/hooks/useLocale";
import { strings } from "@/i18n/strings";

export interface DailyLeaderboardProps {
  readonly entries: readonly DailyLeaderboardEntry[];
}

/** Dumb: GET /daily/leaderboard results as a plain table, best score per nickname, already sorted by the server. */
export default function DailyLeaderboard({ entries }: DailyLeaderboardProps) {
  const locale = useLocale();
  const t = strings[locale].daily.leaderboard;

  return (
    <section className="mx-auto max-w-md space-y-3 rounded-2xl border border-white/10 bg-night/45 p-5 backdrop-blur-md">
      <h2 className="font-display text-base font-bold text-frost">{t.title}</h2>
      {entries.length === 0 ? (
        <p className="text-xs text-ice/50">{t.empty}</p>
      ) : (
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-ice/40">
              <th scope="col" className="pb-2 pr-2 font-medium">
                {t.rank}
              </th>
              <th scope="col" className="pb-2 pr-2 font-medium">
                {t.nickname}
              </th>
              <th scope="col" className="pb-2 pr-2 text-right font-medium">
                {t.score}
              </th>
              <th scope="col" className="pb-2 text-right font-medium">
                {t.callsToBingo}
              </th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, index) => (
              <tr key={entry.nickname} className="border-t border-white/5">
                <td className="py-2 pr-2 font-display font-bold text-ice/50">{index + 1}</td>
                <td className="py-2 pr-2 font-medium text-frost">{entry.nickname}</td>
                <td className="py-2 pr-2 text-right font-display font-bold text-frost">{entry.score}</td>
                <td className="py-2 text-right text-ice/60">{entry.callsToBingo}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

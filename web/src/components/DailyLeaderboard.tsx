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
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">{t.title}</h2>
      {entries.length === 0 ? (
        <p className="text-sm text-slate-400">{t.empty}</p>
      ) : (
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-xs uppercase text-slate-400">
              <th scope="col" className="py-1 pr-2">
                {t.rank}
              </th>
              <th scope="col" className="py-1 pr-2">
                {t.nickname}
              </th>
              <th scope="col" className="py-1 pr-2">
                {t.score}
              </th>
              <th scope="col" className="py-1 pr-2">
                {t.callsToBingo}
              </th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, index) => (
              <tr key={entry.nickname} className="border-b border-slate-900">
                <td className="py-1 pr-2 text-slate-400">{index + 1}</td>
                <td className="py-1 pr-2 font-medium text-slate-100">{entry.nickname}</td>
                <td className="py-1 pr-2 font-semibold text-emerald-400">{entry.score}</td>
                <td className="py-1 pr-2 text-slate-300">{entry.callsToBingo}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

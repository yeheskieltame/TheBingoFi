import type { DailyLeaderboardEntry } from "@/lib/api";
import { useLocale } from "@/hooks/useLocale";
import { strings } from "@/i18n/strings";

export interface DailyLeaderboardProps {
  readonly entries: readonly DailyLeaderboardEntry[];
}

/** Medali untuk 3 teratas; sisanya pakai angka peringkat biasa. */
const MEDALS = ["🥇", "🥈", "🥉"] as const;

/**
 * Dumb: GET /daily/leaderboard results, best score per nickname, already
 * sorted by the server. Tiga teratas dibuat menonjol (podium) karena itu yang
 * bikin orang balik tiap hari; sisanya daftar padat.
 */
export default function DailyLeaderboard({ entries }: DailyLeaderboardProps) {
  const locale = useLocale();
  const t = strings[locale].daily.leaderboard;
  const podium = entries.slice(0, 3);
  const rest = entries.slice(3);

  return (
    <section className="space-y-4">
      {entries.length === 0 ? (
        <p className="text-center text-xs text-ice/50">{t.empty}</p>
      ) : (
        <>
          <ol className="space-y-2">
            {podium.map((entry, index) => (
              <li
                key={entry.nickname}
                className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 ${
                  index === 0 ? "bg-frost/15 ring-1 ring-frost/50" : "bg-white/6 ring-1 ring-white/10"
                }`}
              >
                <span aria-hidden className={index === 0 ? "text-2xl" : "text-xl"}>
                  {MEDALS[index]}
                </span>
                <span className="min-w-0 flex-1 truncate font-display font-bold text-frost">{entry.nickname}</span>
                <span className="text-right">
                  <span className="block font-display text-lg font-bold leading-none text-frost">{entry.score}</span>
                  <span className="text-[0.65rem] uppercase tracking-wide text-ice/45">
                    {entry.callsToBingo} {t.callsToBingo}
                  </span>
                </span>
              </li>
            ))}
          </ol>

          {rest.length > 0 && (
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="text-[0.65rem] uppercase tracking-wide text-ice/40">
                  <th scope="col" className="pb-1.5 pr-2 font-medium">
                    {t.rank}
                  </th>
                  <th scope="col" className="pb-1.5 pr-2 font-medium">
                    {t.nickname}
                  </th>
                  <th scope="col" className="pb-1.5 pr-2 text-right font-medium">
                    {t.score}
                  </th>
                  <th scope="col" className="pb-1.5 text-right font-medium">
                    {t.callsToBingo}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rest.map((entry, index) => (
                  <tr key={entry.nickname} className="border-t border-white/5">
                    <td className="py-1.5 pr-2 font-display font-bold text-ice/45">{index + 4}</td>
                    <td className="py-1.5 pr-2 font-medium text-frost">{entry.nickname}</td>
                    <td className="py-1.5 pr-2 text-right font-display font-bold text-frost">{entry.score}</td>
                    <td className="py-1.5 text-right text-ice/60">{entry.callsToBingo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </section>
  );
}

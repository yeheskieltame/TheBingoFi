import type { DailyLeaderboardEntry } from "@/lib/api";
import { strings } from "@/i18n/strings";

const locale = "id";

export interface DailyLeaderboardProps {
  readonly entries: readonly DailyLeaderboardEntry[];
}

/** Dumb: GET /daily/leaderboard results as a plain table, best score per nickname, already sorted by the server. */
export default function DailyLeaderboard({ entries }: DailyLeaderboardProps) {
  const t = strings[locale].daily.leaderboard;

  return (
    <section>
      <h2>{t.title}</h2>
      {entries.length === 0 ? (
        <p>{t.empty}</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th scope="col">{t.rank}</th>
              <th scope="col">{t.nickname}</th>
              <th scope="col">{t.score}</th>
              <th scope="col">{t.callsToBingo}</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, index) => (
              <tr key={entry.nickname}>
                <td>{index + 1}</td>
                <td>{entry.nickname}</td>
                <td>{entry.score}</td>
                <td>{entry.callsToBingo}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

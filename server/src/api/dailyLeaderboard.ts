/**
 * In-memory Daily Challenge leaderboard: best score per nickname, per
 * calendar day. Written to by POST /daily/play, read by GET
 * /daily/leaderboard (see ./http.ts).
 *
 * // ponytail: in-memory per date, resets on restart - swap for real
 * persistence later (same caveat as realtime/rooms.ts and api/questStore.ts).
 */

export interface LeaderboardEntry {
  readonly nickname: string;
  readonly score: number;
  readonly callsToBingo: number;
}

const MAX_LEADERBOARD_SIZE = 50;

const entriesByDate = new Map<string, Map<string, LeaderboardEntry>>();

/** Records `entry` for `dateISO`, keeping only the best score per nickname. */
export function submitScore(dateISO: string, entry: LeaderboardEntry): void {
  let dayEntries = entriesByDate.get(dateISO);
  if (!dayEntries) {
    dayEntries = new Map();
    entriesByDate.set(dateISO, dayEntries);
  }

  const existing = dayEntries.get(entry.nickname);
  if (!existing || entry.score > existing.score) {
    dayEntries.set(entry.nickname, entry);
  }
}

/** Top `MAX_LEADERBOARD_SIZE` entries for `dateISO`, sorted by score descending. */
export function getLeaderboard(dateISO: string): LeaderboardEntry[] {
  const dayEntries = entriesByDate.get(dateISO);
  if (!dayEntries) return [];

  return Array.from(dayEntries.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_LEADERBOARD_SIZE);
}

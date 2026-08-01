/** i18n strings a caller must supply - see i18n/strings.ts's `plaza` block (id/en). */
export interface RelativeTimeStrings {
  readonly justNow: string;
  /** Appended directly after a minute count, e.g. "2" + "m" -> "2m". */
  readonly minuteSuffix: string;
  /** Appended directly after an hour count, e.g. "1" + "j" -> "1j" (id). */
  readonly hourSuffix: string;
  readonly yesterday: string;
  /** Appended directly after a day count (2+ days ago, not "yesterday"). */
  readonly daySuffix: string;
}

/**
 * Formats a `PlazaMessage.at` timestamp (epoch ms) as a short relative
 * label - "2m", "1j"/"1h", "kemarin"/"yesterday", "3h"/"3d" - matching the
 * compact style used across X-like feeds. Pure function: `now` defaults to
 * `Date.now()` but is overridable so callers (and any future tests) don't
 * depend on the wall clock.
 */
export function relativeTime(at: number, strings: RelativeTimeStrings, now: number = Date.now()): string {
  const diffMs = Math.max(0, now - at);
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return strings.justNow;
  if (minutes < 60) return `${minutes}${strings.minuteSuffix}`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}${strings.hourSuffix}`;
  if (hours < 48) return strings.yesterday;

  const days = Math.floor(hours / 24);
  return `${days}${strings.daySuffix}`;
}

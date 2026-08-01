import BingoLetters from "@/components/BingoLetters";
import { useLocale } from "@/hooks/useLocale";
import { strings } from "@/i18n/strings";

export interface PlazaResultAttachmentProps {
  readonly won: boolean;
  /** Completed line count, 0-5 - rendered as B-I-N-G-O letters via BingoLetters (compact). */
  readonly lines: number;
  readonly calls: number;
  readonly opponent?: string;
}

/**
 * Match-result card attached to a Plaza message (CONCEPT.md §7.4b) - built
 * from real /play match data (see components/MatchResult.tsx's "Bagikan ke
 * Plaza" button, app/play/page.tsx's handleShareToPlaza), never invented
 * numbers. Win/loss status is the biggest, most contrasted element (same
 * "momen, bukan sekadar notifikasi" intent as MatchResult itself); line
 * progress reuses the same B-I-N-G-O letters players already read in-match
 * rather than a bare number, so the card stays legible even out of context.
 */
export default function PlazaResultAttachment({ won, lines, calls, opponent }: PlazaResultAttachmentProps) {
  const locale = useLocale();
  const t = strings[locale].plaza;

  return (
    <div
      className={`mt-2 w-full max-w-[280px] rounded-2xl border p-3 backdrop-blur-md ${
        won ? "border-frost/40 bg-glacier-deep/25" : "border-white/10 bg-night/55"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={`font-display text-sm font-bold uppercase tracking-wide ${won ? "text-frost" : "text-ice/60"}`}>
          {won ? t.resultWon : t.resultLost}
        </span>
        <BingoLetters count={lines} compact />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ice/55">
        <span>
          {calls} {t.resultCalls}
        </span>
        {opponent && (
          <span className="truncate">
            {t.resultOpponentPrefix}
            {opponent}
          </span>
        )}
      </div>
    </div>
  );
}

import { useLocale } from "@/hooks/useLocale";
import { strings } from "@/i18n/strings";

export interface MatchResultPlayer {
  readonly playerId: string;
  readonly nickname: string;
}

export interface MatchResultProps {
  readonly winnerId: string | null;
  readonly reason?: string;
  readonly players: readonly MatchResultPlayer[];
  readonly onBackToLanding: () => void;
  readonly onPlayAgain?: () => void;
}

const REASON_KEY: Record<string, "reasonPlayerLeft" | "reasonPlayerDisconnected"> = {
  player_left: "reasonPlayerLeft",
  player_disconnected: "reasonPlayerDisconnected",
};

/** Dumb: match:ended screen - winner (or why the match was aborted), a rematch action, and a way back to the landing page. */
export default function MatchResult({ winnerId, reason, players, onBackToLanding, onPlayAgain }: MatchResultProps) {
  const locale = useLocale();
  const t = strings[locale].play.result;
  const winner = winnerId ? players.find((p) => p.playerId === winnerId) : undefined;
  const reasonKey = reason ? REASON_KEY[reason] : undefined;

  return (
    <section className="space-y-5 rounded-3xl border border-white/10 bg-night/60 p-8 text-center backdrop-blur-md">
      <h2 className="font-display text-3xl font-bold tracking-tight text-frost">{t.title}</h2>

      {winnerId ? (
        <div className="space-y-2">
          <p aria-hidden className="text-5xl">🏆</p>
          <p className="text-sm uppercase tracking-wide text-ice/50">{t.winner}</p>
          <p className="font-display text-2xl font-bold text-frost">{winner?.nickname ?? winnerId}</p>
        </div>
      ) : (
        <p className="text-sm text-ice/60">
          {t.noWinner}
          {reasonKey ? ` · ${t[reasonKey]}` : reason ? ` · ${reason}` : ""}
        </p>
      )}

      <div className="flex flex-wrap justify-center gap-2">
        {onPlayAgain && (
          <button
            type="button"
            onClick={onPlayAgain}
            className="rounded-full bg-glacier-deep px-8 py-2.5 font-display text-base font-bold text-frost shadow-lg shadow-glacier-deep/40 transition-colors hover:bg-glacier"
          >
            {strings[locale].play.result.playAgain}
          </button>
        )}
        <button
          type="button"
          onClick={onBackToLanding}
          className="rounded-full border border-white/15 px-6 py-2.5 font-display text-base font-semibold text-ice transition-colors hover:border-white/35 hover:text-frost"
        >
          {strings[locale].common.back}
        </button>
      </div>
    </section>
  );
}

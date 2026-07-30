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
    <section className="space-y-4 rounded border border-slate-800 bg-slate-900/60 p-4 text-center">
      <h2 className="text-xl font-bold">{t.title}</h2>

      {winnerId ? (
        <p className="text-lg">
          🏆 {t.winner}: <span className="font-semibold text-emerald-400">{winner?.nickname ?? winnerId}</span>
        </p>
      ) : (
        <p className="text-slate-300">
          {t.noWinner}
          {reasonKey ? ` — ${t[reasonKey]}` : reason ? ` — ${reason}` : ""}
        </p>
      )}

      <div className="flex flex-wrap justify-center gap-2">
        {onPlayAgain && (
          <button
            type="button"
            onClick={onPlayAgain}
            className="rounded bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
          >
            {strings[locale].play.result.playAgain}
          </button>
        )}
        <button
          type="button"
          onClick={onBackToLanding}
          className="rounded border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
        >
          {strings[locale].common.back}
        </button>
      </div>
    </section>
  );
}

import { strings } from "@/i18n/strings";

const locale = "id";

export interface MatchResultPlayer {
  readonly playerId: string;
  readonly nickname: string;
}

export interface MatchResultProps {
  readonly winnerId: string | null;
  readonly reason?: string;
  readonly players: readonly MatchResultPlayer[];
  readonly onBackToLanding: () => void;
}

const REASON_KEY: Record<string, "reasonPlayerLeft" | "reasonPlayerDisconnected"> = {
  player_left: "reasonPlayerLeft",
  player_disconnected: "reasonPlayerDisconnected",
};

/** Dumb: match:ended screen - winner (or why the match was aborted) plus a way back to the landing page. */
export default function MatchResult({ winnerId, reason, players, onBackToLanding }: MatchResultProps) {
  const t = strings[locale].play.result;
  const winner = winnerId ? players.find((p) => p.playerId === winnerId) : undefined;
  const reasonKey = reason ? REASON_KEY[reason] : undefined;

  return (
    <section>
      <h2>{t.title}</h2>

      {winnerId ? (
        <p>
          {t.winner}: {winner?.nickname ?? winnerId}
        </p>
      ) : (
        <p>
          {t.noWinner}
          {reasonKey ? ` — ${t[reasonKey]}` : reason ? ` — ${reason}` : ""}
        </p>
      )}

      <button type="button" onClick={onBackToLanding}>
        {strings[locale].common.back}
      </button>
    </section>
  );
}

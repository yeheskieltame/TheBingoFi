import { MAX_NUMBER, MIN_NUMBER } from "@thebingofi/server/engine";
import type { MatchView } from "@thebingofi/server/protocol";

import { strings } from "@/i18n/strings";

const locale = "id";

export interface MatchBoardProps {
  readonly view: MatchView;
  readonly playerId: string;
  readonly onCall: (number: number) => void;
  readonly pending: boolean;
}

/** Dumb: the "playing" phase - own board, called numbers, whose turn, line counts, and (only on your turn) a number picker that emits match:call. */
export default function MatchBoard({ view, playerId, onCall, pending }: MatchBoardProps) {
  const t = strings[locale].play.match;
  const calledSet = new Set(view.calledNumbers);
  const isMyTurn = view.status === "in_progress" && view.currentTurnPlayerId === playerId;
  const currentTurnPlayer = view.players.find((p) => p.playerId === view.currentTurnPlayerId);

  return (
    <section>
      <h2>{t.title}</h2>

      <h3>{t.yourBoard}</h3>
      {view.board && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5,2rem)" }}>
          {view.board.map((number, index) => {
            const marked = calledSet.has(number);
            return (
              <button key={index} type="button" aria-pressed={marked} disabled>
                {marked ? "✓" : ""} {number}
              </button>
            );
          })}
        </div>
      )}

      <h3>{t.calledNumbers}</h3>
      {view.calledNumbers.length === 0 ? (
        <p>{t.noCallsYet}</p>
      ) : (
        <ol>
          {view.calledNumbers.map((number) => (
            <li key={number}>{number}</li>
          ))}
        </ol>
      )}

      <h3>{t.playersTitle}</h3>
      <table>
        <thead>
          <tr>
            <th scope="col">{strings[locale].landing.nicknameLabel}</th>
            <th scope="col">{t.lines}</th>
            <th scope="col">{t.currentTurn}</th>
          </tr>
        </thead>
        <tbody>
          {view.players.map((player) => (
            <tr key={player.playerId}>
              <td>{player.nickname}</td>
              <td>{player.lineCount}</td>
              <td>{player.playerId === view.currentTurnPlayerId ? "✓" : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {view.status === "in_progress" && (
        <p>{isMyTurn ? t.yourTurn : `${t.waitingTurn}: ${currentTurnPlayer?.nickname ?? ""}`}</p>
      )}

      {isMyTurn && (
        <fieldset disabled={pending}>
          <legend>{t.callNumber}</legend>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5,2rem)" }}>
            {Array.from({ length: MAX_NUMBER - MIN_NUMBER + 1 }, (_, i) => MIN_NUMBER + i).map((number) => (
              <button key={number} type="button" onClick={() => onCall(number)} disabled={calledSet.has(number)}>
                {number}
              </button>
            ))}
          </div>
        </fieldset>
      )}
    </section>
  );
}

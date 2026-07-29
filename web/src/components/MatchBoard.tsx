import { MAX_NUMBER, markedCellsFor, MIN_NUMBER } from "@thebingofi/server/engine";
import type { MatchView } from "@thebingofi/server/protocol";

import type { SkillSelectionState } from "@/hooks/useRoom";
import { strings } from "@/i18n/strings";

const locale = "id";

export interface MatchBoardProps {
  readonly view: MatchView;
  readonly playerId: string;
  readonly onCall: (number: number) => void;
  readonly pending: boolean;
  /** WILD_DAUB/CELL_SWAP cell selection in progress, if any - see hooks/useRoom.ts. While set, own board cells become clickable (via onSelectSkillCell) instead of the plain marked/unmarked display. */
  readonly skillSelection?: SkillSelectionState | null;
  readonly onSelectSkillCell?: (index: number) => void;
}

/** Dumb: the "playing" phase - own board, called numbers, whose turn, line counts, and (only on your turn) a number picker that emits match:call. */
export default function MatchBoard({ view, playerId, onCall, pending, skillSelection, onSelectSkillCell }: MatchBoardProps) {
  const t = strings[locale].play.match;
  const calledSet = new Set(view.calledNumbers);
  const isMyTurn = view.status === "in_progress" && view.currentTurnPlayerId === playerId;
  const currentTurnPlayer = view.players.find((p) => p.playerId === view.currentTurnPlayerId);
  const selecting = Boolean(skillSelection && onSelectSkillCell);

  return (
    <section>
      <h2>{t.title}</h2>

      <h3>{t.yourBoard}</h3>
      {view.board && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5,2rem)" }}>
          {markedCellsFor(view.board, calledSet, new Set(view.ghostNumbers ?? []), view.daubedCells ?? []).map(
            (marked, index) => {
              const number = view.board![index]!;
              if (selecting) {
                const picked = skillSelection!.cells.includes(index);
                return (
                  <button
                    key={index}
                    type="button"
                    aria-pressed={picked}
                    onClick={() => onSelectSkillCell!(index)}
                  >
                    {picked ? "●" : ""} {number}
                  </button>
                );
              }
              return (
                <button key={index} type="button" aria-pressed={marked} disabled>
                  {marked ? "✓" : ""} {number}
                </button>
              );
            },
          )}
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

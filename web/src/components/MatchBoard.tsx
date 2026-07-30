import { markedCellsFor } from "@thebingofi/server/engine";
import type { MatchView } from "@thebingofi/server/protocol";

import { useLocale } from "@/hooks/useLocale";
import type { SkillSelectionState } from "@/hooks/useRoom";
import { strings } from "@/i18n/strings";
import BingoLetters from "@/components/BingoLetters";

export interface MatchBoardProps {
  readonly view: MatchView;
  readonly playerId: string;
  readonly onCall: (number: number) => void;
  readonly pending: boolean;
  /** WILD_DAUB/CELL_SWAP cell selection in progress, if any - see hooks/useRoom.ts. While set, own board cells select skill targets instead of calling numbers. */
  readonly skillSelection?: SkillSelectionState | null;
  readonly onSelectSkillCell?: (index: number) => void;
}

/**
 * Dumb: the "playing" phase. The own board IS the number picker — every
 * board contains all 25 numbers, so on your turn you call by clicking an
 * unmarked cell of your own board (no separate 1-25 grid; calling an
 * already-marked-for-you number is never beneficial anyway). Line progress
 * renders as B-I-N-G-O letters (1 garis = B ... 5 = BINGO).
 */
export default function MatchBoard({ view, playerId, onCall, pending, skillSelection, onSelectSkillCell }: MatchBoardProps) {
  const locale = useLocale();
  const t = strings[locale].play.match;
  const calledSet = new Set(view.calledNumbers);
  const isMyTurn = view.status === "in_progress" && view.currentTurnPlayerId === playerId;
  const currentTurnPlayer = view.players.find((p) => p.playerId === view.currentTurnPlayerId);
  const me = view.players.find((p) => p.playerId === playerId);
  const selecting = Boolean(skillSelection && onSelectSkillCell);
  const canCall = isMyTurn && !selecting && !pending;

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">{t.title}</h2>

      {view.status === "in_progress" && (
        <p
          role="status"
          className={`rounded px-3 py-2 text-center text-sm font-bold ${
            isMyTurn ? "bg-emerald-600 text-white" : "bg-slate-800 text-slate-300"
          }`}
        >
          {isMyTurn ? t.yourTurn : `${t.waitingTurn}: ${currentTurnPlayer?.nickname ?? ""}`}
        </p>
      )}

      <div>
        <div className="mb-1 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-300">{t.yourBoard}</h3>
          <BingoLetters count={me?.lineCount ?? 0} />
        </div>
        {canCall && <p className="mb-2 text-xs text-indigo-300">{t.callHint}</p>}
        {view.board && (
          <div className="grid max-w-xs grid-cols-5 gap-1.5 sm:gap-2">
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
                      className={`aspect-square rounded text-base font-semibold sm:text-lg ${
                        picked ? "bg-amber-500 text-slate-950" : "bg-slate-800 text-slate-100 hover:bg-slate-700"
                      }`}
                    >
                      {number}
                    </button>
                  );
                }
                const callable = canCall && !marked;
                return (
                  <button
                    key={index}
                    type="button"
                    aria-pressed={marked}
                    disabled={!callable}
                    onClick={callable ? () => onCall(number) : undefined}
                    className={`aspect-square rounded text-base font-semibold transition-colors sm:text-lg ${
                      marked
                        ? "bg-emerald-700 text-white"
                        : callable
                          ? "bg-indigo-700 text-white hover:bg-indigo-600"
                          : "bg-slate-800 text-slate-200"
                    }`}
                  >
                    {number}
                  </button>
                );
              },
            )}
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-1 text-sm font-semibold text-slate-300">{t.calledNumbers}</h3>
        {view.calledNumbers.length === 0 ? (
          <p className="text-sm text-slate-500">{t.noCallsYet}</p>
        ) : (
          <ol className="flex flex-wrap gap-1">
            {view.calledNumbers.map((number, index) => (
              <li
                key={number}
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                  index === view.calledNumbers.length - 1
                    ? "bg-indigo-600 text-white"
                    : "bg-slate-800 text-slate-300"
                }`}
              >
                {number}
              </li>
            ))}
          </ol>
        )}
      </div>

      <div>
        <h3 className="mb-1 text-sm font-semibold text-slate-300">{t.playersTitle}</h3>
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-xs uppercase text-slate-400">
              <th scope="col" className="py-1 pr-2">
                {strings[locale].landing.nicknameLabel}
              </th>
              <th scope="col" className="py-1 pr-2">
                {t.lines}
              </th>
              <th scope="col" className="py-1 pr-2">
                {t.currentTurn}
              </th>
            </tr>
          </thead>
          <tbody>
            {view.players.map((player) => (
              <tr key={player.playerId} className="border-b border-slate-900">
                <td className="py-1 pr-2 font-medium text-slate-100">{player.nickname}</td>
                <td className="py-1 pr-2 text-slate-300">
                  <BingoLetters count={player.lineCount} compact />
                </td>
                <td className="py-1 pr-2 text-emerald-400">
                  {player.playerId === view.currentTurnPlayerId ? "✓" : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

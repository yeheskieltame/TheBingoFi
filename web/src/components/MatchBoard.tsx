import { MAX_NUMBER, markedCellsFor, MIN_NUMBER } from "@thebingofi/server/engine";
import type { MatchView } from "@thebingofi/server/protocol";

import { useLocale } from "@/hooks/useLocale";
import type { SkillSelectionState } from "@/hooks/useRoom";
import { strings } from "@/i18n/strings";

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
  const locale = useLocale();
  const t = strings[locale].play.match;
  const calledSet = new Set(view.calledNumbers);
  const isMyTurn = view.status === "in_progress" && view.currentTurnPlayerId === playerId;
  const currentTurnPlayer = view.players.find((p) => p.playerId === view.currentTurnPlayerId);
  const selecting = Boolean(skillSelection && onSelectSkillCell);

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
        <h3 className="mb-1 text-sm font-semibold text-slate-300">{t.yourBoard}</h3>
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
                return (
                  <button
                    key={index}
                    type="button"
                    aria-pressed={marked}
                    disabled
                    className={`aspect-square rounded text-base font-semibold sm:text-lg ${
                      marked ? "bg-emerald-700 text-white" : "bg-slate-800 text-slate-200"
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
                <td className="py-1 pr-2 text-slate-300">{player.lineCount}</td>
                <td className="py-1 pr-2 text-emerald-400">
                  {player.playerId === view.currentTurnPlayerId ? "✓" : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isMyTurn && (
        <fieldset disabled={pending} className="space-y-1">
          <legend className="mb-1 text-sm font-semibold text-slate-300">{t.callNumber}</legend>
          <div className="grid max-w-xs grid-cols-5 gap-1.5 sm:gap-2">
            {Array.from({ length: MAX_NUMBER - MIN_NUMBER + 1 }, (_, i) => MIN_NUMBER + i).map((number) => (
              <button
                key={number}
                type="button"
                onClick={() => onCall(number)}
                disabled={calledSet.has(number)}
                className="aspect-square rounded bg-indigo-700 text-sm font-semibold text-white hover:bg-indigo-600 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-600"
              >
                {number}
              </button>
            ))}
          </div>
        </fieldset>
      )}
    </section>
  );
}

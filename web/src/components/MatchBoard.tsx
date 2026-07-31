"use client";

import { useState } from "react";
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

  const marks = view.board
    ? markedCellsFor(view.board, calledSet, new Set(view.ghostNumbers ?? []), view.daubedCells ?? [])
    : [];
  // Sel mana yang BARU ter-mark pada render ini - dipakai untuk animasi daub,
  // momen paling sering terjadi di game (BRIEF.md §4). Dibandingkan saat render
  // (bukan lewat effect) supaya animasinya jalan di frame yang sama.
  const marksKey = marks.map((m) => (m ? "1" : "0")).join("");
  const [prevMarksKey, setPrevMarksKey] = useState(marksKey);
  if (prevMarksKey !== marksKey) setPrevMarksKey(marksKey);
  const justMarked = (index: number) => marks[index] === true && prevMarksKey[index] === "0";
  const canCall = isMyTurn && !selecting && !pending;

  return (
    <section className="space-y-5 rounded-3xl border border-white/10 bg-night/55 p-4 backdrop-blur-md sm:p-6">
      {/* Progres BINGO = kepala layar: paling besar, paling atas. */}
      <div className="flex flex-col items-center gap-3">
        <BingoLetters count={me?.lineCount ?? 0} />

        {view.status === "in_progress" && (
          <p
            role="status"
            className={`rounded-full px-5 py-2 text-center font-display text-sm font-bold transition-colors ${
              isMyTurn
                ? "bg-frost text-glacier-ink shadow-lg shadow-frost/25"
                : "border border-white/15 bg-night/50 text-ice/70"
            }`}
          >
            {isMyTurn ? t.yourTurn : `${t.waitingTurn}: ${currentTurnPlayer?.nickname ?? ""}`}
          </p>
        )}
      </div>

      {/* Board sendiri = tempat memanggil angka. Empat status sel dibedakan
          jelas: ter-mark (putih solid), bisa diklik saat giliranku (biru
          gletser + hover naik), target skill (kuning), dan diam (kaca). */}
      <div className="flex flex-col items-center gap-2">
        {canCall && <p className="font-display text-xs font-semibold text-glacier">{t.callHint}</p>}
        {/* Lebar papan mengikuti lebar tersedia (sel `aspect-square`, bukan
            `size-*` tetap) - dengan ukuran tetap, 5 sel + gap melebihi layar
            HP kecil dan papan terpotong. */}
        {view.board && (
          <div className="w-full max-w-[21rem] rounded-3xl bg-night/40 p-2 ring-1 ring-white/10 sm:max-w-[24rem] sm:p-2.5">
            <div className="grid grid-cols-5 gap-1 sm:gap-1.5">
              {marks.map(
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
                        className={`aspect-square w-full rounded-xl font-display text-base font-bold transition-all sm:text-lg ${
                          picked
                            ? "-translate-y-0.5 bg-amber-400 text-glacier-ink shadow-lg shadow-amber-400/30 ring-2 ring-amber-200"
                            : "bg-white/8 text-frost ring-1 ring-amber-300/40 hover:-translate-y-0.5 hover:bg-amber-400/20"
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
                      className={`aspect-square w-full rounded-xl font-display text-base font-bold transition-all sm:text-lg ${
                        justMarked(index) ? "animate-daub" : ""
                      } ${
                        marked
                          ? "bg-frost text-glacier-ink shadow-lg shadow-frost/20 ring-1 ring-frost"
                          : callable
                            ? "bg-glacier-deep text-frost ring-1 ring-glacier hover:-translate-y-0.5 hover:bg-glacier hover:shadow-lg hover:shadow-glacier/30"
                            : "bg-white/6 text-ice/50 ring-1 ring-white/10"
                      }`}
                    >
                      {number}
                    </button>
                  );
                },
              )}
            </div>
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <h3 className="text-xs uppercase tracking-wide text-ice/45">{t.calledNumbers}</h3>
        {view.calledNumbers.length === 0 ? (
          <p className="text-xs text-ice/40">{t.noCallsYet}</p>
        ) : (
          <ol className="flex flex-wrap gap-1">
            {view.calledNumbers.map((number, index) => (
              <li
                key={number}
                className={`flex size-7 items-center justify-center rounded-full font-display text-xs font-bold ${
                  index === view.calledNumbers.length - 1
                    ? "bg-glacier text-frost ring-2 ring-frost/60"
                    : "bg-white/8 text-ice/70"
                }`}
              >
                {number}
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="space-y-1.5">
        <h3 className="text-xs uppercase tracking-wide text-ice/45">{t.playersTitle}</h3>
        <ul className="space-y-1.5">
          {view.players.map((player) => {
            const turn = player.playerId === view.currentTurnPlayerId;
            return (
              <li
                key={player.playerId}
                className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2 ${
                  turn ? "bg-white/10 ring-1 ring-frost/40" : "bg-night/40 ring-1 ring-white/8"
                }`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  {turn && (
                    <span aria-hidden className="text-xs text-frost">
                      ▶
                    </span>
                  )}
                  <span className="truncate font-display text-sm font-bold text-frost">{player.nickname}</span>
                </span>
                <BingoLetters count={player.lineCount} compact />
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

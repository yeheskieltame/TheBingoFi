"use client";

import { useState } from "react";
import { useLocale } from "@/hooks/useLocale";
import { strings } from "@/i18n/strings";

export interface DraftBoardProps {
  /** 25 numbers, row-major (same layout as engine's Board) - the board being arranged. */
  readonly numbers: readonly number[];
  readonly selectedIndex: number | null;
  readonly onSelectCell: (index: number) => void;
  /** Swap two cells directly (drag & drop path; click path goes through onSelectCell). */
  readonly onSwapCells: (a: number, b: number) => void;
  readonly onShuffle: () => void;
  readonly valid: boolean;
  readonly validationError?: string;
}

/**
 * Dumb: 5x5 board editor. Two ways to swap numbers:
 * - click a cell, then click a second cell (works everywhere incl. touch)
 * - drag a cell onto another (HTML5 native DnD - desktop; touch falls back
 *   to click-to-swap, no extra dependency)
 * State lives in hooks/useDraftBoard.ts; only dragOverIndex (pure visual
 * hint) is local. Reused by /play's draft phase and /daily.
 *
 * Renders the grid only - the section heading belongs to the caller, since
 * /daily makes the board its hero (own big title) while /play labels it as
 * one phase among several.
 */
export default function DraftBoard({
  numbers,
  selectedIndex,
  onSelectCell,
  onSwapCells,
  onShuffle,
  valid,
  validationError,
}: DraftBoardProps) {
  const locale = useLocale();
  const t = strings[locale].play.draft;
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  return (
    <div className="flex flex-col items-center gap-3.5">
      {/* Panel kaca gelap: bikin papan menonjol dan tetap terbaca di atas
          background art (/daily), tanpa mengganggu latar polos (/play). */}
      <div className="rounded-3xl bg-night/40 p-2.5 backdrop-blur-md">
        <div className="grid grid-cols-5 gap-1.5">
          {numbers.map((number, index) => (
            <button
              key={index}
              type="button"
              aria-pressed={selectedIndex === index}
              onClick={() => onSelectCell(index)}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("text/plain", String(index));
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setDragOverIndex(index);
              }}
              onDragLeave={() => setDragOverIndex((prev) => (prev === index ? null : prev))}
              onDragEnd={() => setDragOverIndex(null)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverIndex(null);
                const from = Number(e.dataTransfer.getData("text/plain"));
                if (Number.isInteger(from)) onSwapCells(from, index);
              }}
              className={`size-11 cursor-grab rounded-xl font-display text-base font-bold transition-all active:cursor-grabbing sm:size-12 sm:text-lg ${
                selectedIndex === index
                  ? "-translate-y-0.5 bg-frost text-glacier-ink shadow-lg shadow-frost/20 ring-2 ring-frost"
                  : dragOverIndex === index
                    ? "-translate-y-0.5 bg-white/20 text-frost ring-2 ring-frost/60"
                    : "bg-white/8 text-frost ring-1 ring-white/12 backdrop-blur-sm hover:-translate-y-0.5 hover:bg-white/16 hover:ring-white/30"
              }`}
            >
              {number}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2.5">
        <p className="text-xs text-ice/55">{t.instructions}</p>
        <button
          type="button"
          onClick={onShuffle}
          className="rounded-full border border-white/15 px-3 py-1 font-display text-xs font-semibold text-ice transition-colors hover:border-white/30 hover:text-frost"
        >
          {t.shuffle}
        </button>
      </div>

      {!valid && validationError && (
        <p role="alert" className="text-sm text-red-400">
          {validationError}
        </p>
      )}
    </div>
  );
}

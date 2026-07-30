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
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">{t.title}</h2>
      <p className="text-sm text-slate-400">{t.instructions}</p>

      <div className="grid max-w-xs grid-cols-5 gap-1.5 sm:gap-2">
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
            className={`aspect-square cursor-grab rounded text-base font-semibold transition-colors active:cursor-grabbing sm:text-lg ${
              selectedIndex === index
                ? "bg-indigo-600 text-white ring-2 ring-indigo-400"
                : dragOverIndex === index
                  ? "bg-slate-700 text-slate-100 ring-2 ring-slate-400"
                  : "bg-slate-800 text-slate-100 hover:bg-slate-700"
            }`}
          >
            {number}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={onShuffle}
        className="rounded border border-slate-700 px-3 py-1.5 text-sm font-semibold text-slate-200 hover:bg-slate-800"
      >
        {t.shuffle}
      </button>

      {!valid && validationError && (
        <p role="alert" className="text-sm text-red-400">
          {validationError}
        </p>
      )}
    </section>
  );
}

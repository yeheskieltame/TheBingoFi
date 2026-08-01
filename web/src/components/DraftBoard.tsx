"use client";

import { useState, type DragEvent } from "react";
import Image from "next/image";
import { LuSparkle } from "react-icons/lu";

import { useLocale } from "@/hooks/useLocale";
import { strings } from "@/i18n/strings";
import type { BoardSkin } from "@/lib/boardSkins";

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
  /** Board-number -> owned-skill artwork (hooks/useBoardSkins.ts), empty when no skill is owned/wallet isn't connected - cosmetic only, see lib/boardSkins.ts. */
  readonly skins?: ReadonlyMap<number, BoardSkin>;
}

/** See MatchBoard.tsx's identical constant - keeps skinned-cell numbers legible over arbitrary artwork. */
const SKIN_TEXT_SHADOW = "[text-shadow:0_1px_2px_rgba(0,0,0,0.85),0_0_6px_rgba(0,0,0,0.6)]";

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
  skins,
}: DraftBoardProps) {
  const locale = useLocale();
  const t = strings[locale].play.draft;
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  return (
    <div className="flex w-full flex-col items-center gap-3.5">
      {/* Panel kaca gelap: bikin papan menonjol dan tetap terbaca di atas
          background art (/daily), tanpa mengganggu latar polos (/play).
          Lebarnya mengikuti ruang yang ada (sel `aspect-square`) supaya papan
          tidak melebihi layar HP kecil. */}
      <div className="w-full max-w-[20rem] rounded-3xl bg-night/40 p-2 backdrop-blur-md sm:max-w-[21rem] sm:p-2.5">
        <div className="grid grid-cols-5 gap-1 sm:gap-1.5">
          {numbers.map((number, index) => {
            const skin = skins?.get(number);
            const selected = selectedIndex === index;
            const draggedOver = dragOverIndex === index;
            const dragHandlers = {
              draggable: true,
              onDragStart: (e: DragEvent<HTMLButtonElement>) => {
                e.dataTransfer.setData("text/plain", String(index));
                e.dataTransfer.effectAllowed = "move";
              },
              onDragOver: (e: DragEvent<HTMLButtonElement>) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setDragOverIndex(index);
              },
              onDragLeave: () => setDragOverIndex((prev) => (prev === index ? null : prev)),
              onDragEnd: () => setDragOverIndex(null),
              onDrop: (e: DragEvent<HTMLButtonElement>) => {
                e.preventDefault();
                setDragOverIndex(null);
                const from = Number(e.dataTransfer.getData("text/plain"));
                if (Number.isInteger(from)) onSwapCells(from, index);
              },
            };

            if (skin) {
              return (
                <button
                  key={index}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onSelectCell(index)}
                  title={`${t.skinLabel}: ${skin.skillName}`}
                  {...dragHandlers}
                  className={`group relative aspect-square w-full cursor-grab overflow-hidden rounded-xl font-display text-base font-bold transition-all active:cursor-grabbing sm:text-lg ${
                    selected
                      ? "-translate-y-0.5 shadow-lg shadow-frost/20 ring-2 ring-frost"
                      : draggedOver
                        ? "-translate-y-0.5 ring-2 ring-frost/60"
                        : "ring-1 ring-white/20 hover:-translate-y-0.5 hover:ring-white/40"
                  }`}
                >
                  <Image src={skin.imageUrl} alt="" fill sizes="80px" className="object-cover" />
                  <span
                    aria-hidden
                    className={`absolute inset-0 transition-colors ${
                      selected ? "bg-frost/65" : draggedOver ? "bg-white/35" : "bg-black/45 group-hover:bg-black/30"
                    }`}
                  />
                  <LuSparkle aria-hidden className="absolute right-1 top-1 z-20 size-2.5 text-white/85 drop-shadow sm:size-3" />
                  <span className={`relative z-10 ${SKIN_TEXT_SHADOW} ${selected ? "text-glacier-ink" : "text-frost"}`}>
                    {number}
                  </span>
                </button>
              );
            }

            return (
              <button
                key={index}
                type="button"
                aria-pressed={selected}
                onClick={() => onSelectCell(index)}
                {...dragHandlers}
                className={`aspect-square w-full cursor-grab rounded-xl font-display text-base font-bold transition-all active:cursor-grabbing sm:text-lg ${
                  selected
                    ? "-translate-y-0.5 bg-frost text-glacier-ink shadow-lg shadow-frost/20 ring-2 ring-frost"
                    : draggedOver
                      ? "-translate-y-0.5 bg-white/20 text-frost ring-2 ring-frost/60"
                      : "bg-white/8 text-frost ring-1 ring-white/12 backdrop-blur-sm hover:-translate-y-0.5 hover:bg-white/16 hover:ring-white/30"
                }`}
              >
                {number}
              </button>
            );
          })}
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

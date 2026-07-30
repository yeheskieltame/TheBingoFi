"use client";

import { useState } from "react";

const LETTERS = ["B", "I", "N", "G", "O"] as const;

export interface BingoLettersProps {
  /** Completed line count; the first `count` letters light up (5 = full BINGO). */
  readonly count: number;
  /** Small variant for table rows / player lists. */
  readonly compact?: boolean;
}

/**
 * Dumb: line progress as B-I-N-G-O letters — 1 garis = B, 5 garis = BINGO.
 * Huruf yang menyala pakai putih salju + glow, yang belum tetap kaca gelap:
 * kontrasnya sengaja tajam karena ini indikator "seberapa dekat menang" yang
 * dibaca sekilas di tengah match.
 */
export default function BingoLetters({ count, compact = false }: BingoLettersProps) {
  const lit = Math.min(count, LETTERS.length);

  // "Adjust state during render" (react.dev's "You Might Not Need an Effect"):
  // huruf yang BARU menyala pada render ini dianimasikan sekali. Tanpa ini
  // seluruh deretan ikut memantul tiap kali komponen render ulang.
  const [prevLit, setPrevLit] = useState(lit);
  if (prevLit !== lit) setPrevLit(lit);
  const justLitFrom = prevLit < lit ? prevLit : lit;
  return (
    <span className={`inline-flex ${compact ? "gap-0.5" : "gap-1.5"}`} aria-label={`${lit}/5 BINGO`}>
      {LETTERS.map((letter, i) => (
        <span
          key={letter}
          className={`flex items-center justify-center rounded-lg font-display font-bold transition-all ${
            compact ? "size-5 text-[10px]" : "size-9 text-lg sm:size-10 sm:text-xl"
          } ${
            i < lit
              ? "bg-frost text-glacier-ink shadow-lg shadow-frost/30 ring-1 ring-frost"
              : "bg-white/5 text-ice/25 ring-1 ring-white/10"
          } ${!compact && i >= justLitFrom && i < lit ? "animate-letter" : ""}`}
        >
          {letter}
        </span>
      ))}
    </span>
  );
}

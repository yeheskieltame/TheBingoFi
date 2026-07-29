"use client";

import { useCallback, useMemo, useState } from "react";
import { BOARD_SIZE, MIN_NUMBER, validateBoard, type BoardValidationResult } from "@thebingofi/server/engine";

/** A fresh shuffled permutation of MIN_NUMBER..MAX_NUMBER (Fisher-Yates). */
function shuffledNumbers(): number[] {
  const numbers = Array.from({ length: BOARD_SIZE }, (_, i) => MIN_NUMBER + i);
  for (let i = numbers.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [numbers[i], numbers[j]] = [numbers[j]!, numbers[i]!];
  }
  return numbers;
}

/**
 * Draft-board editing state: the 25 numbers (row-major, same layout as
 * engine's Board) plus the "select a cell, select a second cell to swap
 * them" interaction CLAUDE.md/API.md describe. Reused by both /play's
 * draft phase (draft:submit) and /daily (POST /daily/play) - both just
 * need "let the player arrange 1-25 on a 5x5 board", nothing room-specific
 * lives here.
 */
export function useDraftBoard() {
  const [numbers, setNumbers] = useState<number[]>(() => shuffledNumbers());
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const validation: BoardValidationResult = useMemo(() => validateBoard(numbers), [numbers]);

  const shuffle = useCallback(() => {
    setNumbers(shuffledNumbers());
    setSelectedIndex(null);
  }, []);

  /** Click a cell: first click selects it, second click swaps it with the first (clicking the same cell twice deselects). */
  const selectCell = useCallback((index: number) => {
    setSelectedIndex((prev) => {
      if (prev === null) return index;
      if (prev === index) return null;

      setNumbers((prevNumbers) => {
        const next = prevNumbers.slice();
        const a = next[prev]!;
        const b = next[index]!;
        next[prev] = b;
        next[index] = a;
        return next;
      });

      return null;
    });
  }, []);

  return { numbers, selectedIndex, validation, shuffle, selectCell };
}

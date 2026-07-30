const LETTERS = ["B", "I", "N", "G", "O"] as const;

export interface BingoLettersProps {
  /** Completed line count; the first `count` letters light up (5 = full BINGO). */
  readonly count: number;
  /** Small variant for table rows / player lists. */
  readonly compact?: boolean;
}

/** Dumb: line progress as B-I-N-G-O letters — 1 garis = B, 5 garis = BINGO. */
export default function BingoLetters({ count, compact = false }: BingoLettersProps) {
  const lit = Math.min(count, LETTERS.length);
  return (
    <span className={`inline-flex ${compact ? "gap-0.5" : "gap-1"}`} aria-label={`${lit}/5 BINGO`}>
      {LETTERS.map((letter, i) => (
        <span
          key={letter}
          className={`flex items-center justify-center rounded font-black ${
            compact ? "h-5 w-5 text-[10px]" : "h-8 w-8 text-base"
          } ${i < lit ? "bg-amber-400 text-slate-950" : "bg-slate-800 text-slate-600"}`}
        >
          {letter}
        </span>
      ))}
    </span>
  );
}

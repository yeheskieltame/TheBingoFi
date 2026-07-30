import { useLocale } from "@/hooks/useLocale";
import { strings } from "@/i18n/strings";

export interface DraftBoardProps {
  /** 25 numbers, row-major (same layout as engine's Board) - the board being arranged. */
  readonly numbers: readonly number[];
  readonly selectedIndex: number | null;
  readonly onSelectCell: (index: number) => void;
  readonly onShuffle: () => void;
  readonly valid: boolean;
  readonly validationError?: string;
}

/**
 * Dumb: 5x5 board editor. Click a cell to select it, click a second cell to
 * swap their numbers (handled by the caller via onSelectCell - see
 * hooks/useDraftBoard.ts). Reused by /play's draft phase and /daily.
 *
 * Renders the grid only - the section heading belongs to the caller, since
 * /daily makes the board its hero (own big title) while /play labels it as
 * one phase among several.
 */
export default function DraftBoard({ numbers, selectedIndex, onSelectCell, onShuffle, valid, validationError }: DraftBoardProps) {
  const locale = useLocale();
  const t = strings[locale].play.draft;

  return (
    <div className="flex flex-col items-center gap-3.5">
      {/* Panel kaca gelap: bikin papan menonjol dan tetap terbaca di atas
          background art (/daily), tanpa mengganggu latar polos (/play). */}
      <div className="rounded-3xl bg-night/40 p-2.5 ring-1 ring-white/10 backdrop-blur-md">
        <div className="grid grid-cols-5 gap-1.5">
          {numbers.map((number, index) => (
            <button
              key={index}
              type="button"
              aria-pressed={selectedIndex === index}
              onClick={() => onSelectCell(index)}
              className={`size-11 rounded-xl font-display text-base font-bold transition-all sm:size-12 sm:text-lg ${
                selectedIndex === index
                  ? "-translate-y-0.5 bg-frost text-glacier-ink shadow-lg shadow-frost/20 ring-2 ring-frost"
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

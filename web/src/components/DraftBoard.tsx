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
 */
export default function DraftBoard({ numbers, selectedIndex, onSelectCell, onShuffle, valid, validationError }: DraftBoardProps) {
  const locale = useLocale();
  const t = strings[locale].play.draft;

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
            className={`aspect-square rounded text-base font-semibold transition-colors sm:text-lg ${
              selectedIndex === index
                ? "bg-indigo-600 text-white ring-2 ring-indigo-400"
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

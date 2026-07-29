import { strings } from "@/i18n/strings";

const locale = "id";

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
 * The 5-column grid layout is the one styling exception CLAUDE.md/the FE
 * task allow, so the board reads as a grid before the UI team applies real
 * styling.
 */
export default function DraftBoard({ numbers, selectedIndex, onSelectCell, onShuffle, valid, validationError }: DraftBoardProps) {
  const t = strings[locale].play.draft;

  return (
    <section>
      <h2>{t.title}</h2>
      <p>{t.instructions}</p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,2rem)" }}>
        {numbers.map((number, index) => (
          <button key={index} type="button" aria-pressed={selectedIndex === index} onClick={() => onSelectCell(index)}>
            {number}
          </button>
        ))}
      </div>

      <button type="button" onClick={onShuffle}>
        {t.shuffle}
      </button>

      {!valid && validationError && <p role="alert">{validationError}</p>}
    </section>
  );
}

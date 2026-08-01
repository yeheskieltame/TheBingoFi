import { useLocale } from "@/hooks/useLocale";
import { strings } from "@/i18n/strings";

export interface PlazaBoardAttachmentProps {
  /** 25 numbers, row-major - same layout as engine's Board. */
  readonly numbers: readonly number[];
  /** Subset of `numbers` that are marked - actual NUMBERS, not cell indices (see lib/matchShare.ts's boardAttachmentFrom). */
  readonly marked?: readonly number[];
}

/**
 * Mini 5x5 board attached to a Plaza message (CONCEPT.md §7.4b "pamer
 * board") - a tiny read-only echo of MatchBoard/DraftBoard's grid, small
 * enough to sit inline in a chat post while keeping numbers legible.
 *
 * Deliberately PLAIN - no skin artwork, unlike MatchBoard/DraftBoard. A
 * board skin (lib/boardSkins.ts) is derived from the OWNER's owned skills'
 * "Featured Number" metadata, but a PlazaMessage carries no wallet/address
 * for its author (see server/API.md: PlazaMessage has no address field) -
 * there's no way to know which skills the POSTER owns from here, and the
 * READER's own owned skins have nothing to do with someone else's board.
 * Rendering plain avoids both misattributing a skin and an extra
 * per-message ownership lookup that wouldn't even resolve to the right
 * wallet.
 */
export default function PlazaBoardAttachment({ numbers, marked }: PlazaBoardAttachmentProps) {
  const locale = useLocale();
  const t = strings[locale].plaza;
  const markedSet = new Set(marked ?? []);

  return (
    <div className="mt-2 w-full max-w-[220px] rounded-2xl border border-white/10 bg-night/55 p-2 backdrop-blur-md">
      <p className="mb-1.5 px-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-ice/45">
        {t.boardAttachmentLabel}
      </p>
      <div className="grid grid-cols-5 gap-1">
        {numbers.map((number, index) => {
          const isMarked = markedSet.has(number);
          return (
            <span
              key={index}
              className={`flex aspect-square items-center justify-center rounded-md font-display text-[10px] font-bold sm:text-xs ${
                isMarked ? "bg-frost text-glacier-ink" : "bg-white/8 text-ice/70"
              }`}
            >
              {number}
            </span>
          );
        })}
      </div>
    </div>
  );
}

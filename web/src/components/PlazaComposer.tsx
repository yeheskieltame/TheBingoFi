"use client";

import { useId, useState, type FormEvent, type KeyboardEvent } from "react";
import type { PlazaAttachment } from "@thebingofi/server/protocol";
import { LuX } from "react-icons/lu";

import PlazaAvatar from "@/components/PlazaAvatar";
import PlazaBoardAttachment from "@/components/PlazaBoardAttachment";
import PlazaSkillAttachment from "@/components/PlazaSkillAttachment";
import type { SkillTier } from "@/lib/skillTier";

const MAX_LENGTH = 280;

export interface PlazaComposerSkillOption {
  readonly skillId: number;
  /** Select-option text, e.g. "Wild Daub (#3)". */
  readonly label: string;
  /** Clean display name for the live preview card - see PlazaSkillAttachment. */
  readonly name: string;
  readonly imageUrl?: string;
  readonly tier?: SkillTier;
}

export interface PlazaComposerProps {
  /** Whose avatar/initials to show while drafting - the composer itself never touches storage/identity, that's resolved by the caller (app/plaza/page.tsx). */
  readonly nickname: string;
  readonly placeholder: string;
  readonly submitLabel: string;
  /** True while a send is in flight (hooks/usePlaza.ts's `sending`) - disables the submit button so a double-click can't fire two posts. */
  readonly sending: boolean;
  /** Called with the trimmed text (and the attachment, if any) on submit - the composer clears its own draft afterward. */
  readonly onSubmit: (text: string, attachment?: PlazaAttachment) => void;
  /**
   * Renders the "attach a skill" dropdown when present - the main
   * top-of-feed composer passes this (CONCEPT.md §7.4b "pamer skill"),
   * inline reply composers omit it to stay lightweight, matching a normal
   * X-style reply box.
   */
  readonly skillPicker?: {
    readonly label: string;
    readonly noneLabel: string;
    readonly options: readonly PlazaComposerSkillOption[];
  };
  /**
   * Renders the "attach my last board" toggle when present - the player's
   * own board from lib/storage.ts's getStoredLastBoard (saved by /play once
   * a match finishes, see lib/matchShare.ts). Only ever ONE candidate board
   * (the last one played), so this is a toggle, not a picker like skills.
   */
  readonly boardOption?: {
    readonly label: string;
    readonly activeLabel: string;
    readonly numbers: readonly number[];
    readonly marked: readonly number[];
  };
  /** Label for the small remove-attachment button on the preview - required whenever `skillPicker` or `boardOption` is passed. */
  readonly removeAttachmentLabel?: string;
  /** Smaller avatar/padding, no outer card chrome - used for inline replies nested inside a PlazaPost. */
  readonly compact?: boolean;
  /** Present only for the inline reply composer (PlazaPost) - the main composer never cancels itself away. */
  readonly onCancel?: () => void;
  readonly cancelLabel?: string;
  readonly autoFocus?: boolean;
}

/**
 * Post/reply composer for the Plaza feed (CONCEPT.md §7.4b). Owns its own
 * unsent draft (`text`/`attachment`) as local, UI-only state - the same
 * carve-out web/README.md documents for Lobby's "copied" button and
 * SkillPanel's Nullify countdown: nothing here touches a socket directly,
 * it just collects input and hands the final value to `onSubmit`, which the
 * caller wires to `usePlaza`'s `send`/`reply`. This is what lets the same
 * component serve both the single top-of-feed composer AND N independent
 * inline reply composers (one per open thread) without the page having to
 * track a draft-per-thread map itself.
 *
 * `attachment` is a single discriminated-union value (skill XOR board -
 * matches the wire shape's `PlazaAttachment`, one field, never both):
 * picking a skill clears a previously-toggled board and vice versa. The
 * preview below the textarea renders with the SAME components the feed
 * uses (PlazaSkillAttachment/PlazaBoardAttachment) so what's shown before
 * sending is exactly what the post will look like after.
 */
export default function PlazaComposer({
  nickname,
  placeholder,
  submitLabel,
  sending,
  onSubmit,
  skillPicker,
  boardOption,
  removeAttachmentLabel,
  compact = false,
  onCancel,
  cancelLabel,
  autoFocus = false,
}: PlazaComposerProps) {
  const [text, setText] = useState("");
  const [attachment, setAttachment] = useState<PlazaAttachment | undefined>(undefined);
  const textId = useId();
  const skillSelectId = useId();

  const trimmed = text.trim();
  const remaining = MAX_LENGTH - text.length;
  const selectedSkillOption =
    attachment?.kind === "skill" ? skillPicker?.options.find((option) => option.skillId === attachment.skillId) : undefined;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!trimmed || sending) return;
    onSubmit(trimmed, attachment);
    setText("");
    setAttachment(undefined);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  function handleInput(event: FormEvent<HTMLTextAreaElement>) {
    const el = event.currentTarget;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={
        compact
          ? "flex gap-2.5"
          : "flex gap-3 rounded-3xl border border-white/10 bg-night/55 p-4 backdrop-blur-md sm:p-5"
      }
    >
      <PlazaAvatar nickname={nickname} className={compact ? "size-7 text-[10px]" : "size-9 text-xs sm:size-10 sm:text-sm"} />

      <div className="min-w-0 flex-1 space-y-2">
        <label htmlFor={textId} className="sr-only">
          {placeholder}
        </label>
        <textarea
          id={textId}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          maxLength={MAX_LENGTH}
          rows={compact ? 1 : 2}
          // Ref-based focus (not the `autoFocus` attribute) - same pattern as
          // Dialog.tsx's panel focus, and avoids jsx-a11y/no-autofocus.
          ref={(node) => {
            if (autoFocus) node?.focus();
          }}
          className="max-h-40 w-full resize-none overflow-hidden rounded-2xl border border-white/15 bg-night/60 px-4 py-2.5 text-sm text-frost backdrop-blur-md placeholder:text-ice/35 focus:border-white/35 focus:outline-none"
        />

        {(skillPicker || boardOption) && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-ice/55">
            {skillPicker && (
              <>
                <label htmlFor={skillSelectId}>{skillPicker.label}</label>
                <select
                  id={skillSelectId}
                  value={attachment?.kind === "skill" ? attachment.skillId : ""}
                  onChange={(event) => {
                    const value = event.target.value;
                    setAttachment(value === "" ? undefined : { kind: "skill", skillId: Number(value) });
                  }}
                  className="rounded-full border border-white/15 bg-night/60 px-3 py-1 font-display text-ice"
                >
                  <option value="">{skillPicker.noneLabel}</option>
                  {skillPicker.options.map((option) => (
                    <option key={option.skillId} value={option.skillId}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </>
            )}

            {boardOption && (
              <button
                type="button"
                aria-pressed={attachment?.kind === "board"}
                onClick={() =>
                  setAttachment((prev) =>
                    prev?.kind === "board"
                      ? undefined
                      : { kind: "board", numbers: [...boardOption.numbers], marked: [...boardOption.marked] },
                  )
                }
                className={`rounded-full border px-3 py-1 font-display transition-colors ${
                  attachment?.kind === "board"
                    ? "border-frost/60 bg-frost/15 text-frost"
                    : "border-white/15 bg-night/60 text-ice hover:border-white/30"
                }`}
              >
                {attachment?.kind === "board" ? boardOption.activeLabel : boardOption.label}
              </button>
            )}
          </div>
        )}

        {attachment && (
          <div className="relative w-fit max-w-full">
            <button
              type="button"
              onClick={() => setAttachment(undefined)}
              aria-label={removeAttachmentLabel}
              className="absolute right-1.5 top-1.5 z-10 grid size-6 place-items-center rounded-full bg-night/80 text-frost ring-1 ring-white/20 transition-colors hover:bg-red-950/80 hover:ring-red-400/50"
            >
              <LuX aria-hidden className="size-3.5" />
            </button>
            {attachment.kind === "skill" && (
              <PlazaSkillAttachment
                skillId={attachment.skillId}
                name={selectedSkillOption?.name ?? `Skill #${attachment.skillId}`}
                imageUrl={selectedSkillOption?.imageUrl}
                tier={selectedSkillOption?.tier}
              />
            )}
            {attachment.kind === "board" && <PlazaBoardAttachment numbers={attachment.numbers} marked={attachment.marked} />}
          </div>
        )}

        <div className="flex items-center justify-end gap-3">
          <span className={`text-[11px] tabular-nums ${remaining < 20 ? "text-red-300" : "text-ice/35"}`}>{remaining}</span>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-full px-3 py-1.5 font-display text-xs font-semibold text-ice/60 transition-colors hover:text-frost"
            >
              {cancelLabel}
            </button>
          )}
          <button
            type="submit"
            disabled={sending || !trimmed || remaining < 0}
            className="rounded-full bg-glacier-deep px-5 py-1.5 font-display text-xs font-bold text-frost transition-colors hover:bg-glacier disabled:cursor-not-allowed disabled:opacity-30 sm:px-6 sm:py-2 sm:text-sm"
          >
            {submitLabel}
          </button>
        </div>
      </div>
    </form>
  );
}

import { useEffect, useState } from "react";
import type { MatchView, SkillResolvedPayload } from "@thebingofi/server/protocol";

import { useLocale } from "@/hooks/useLocale";
import type { SkillSelectionState } from "@/hooks/useRoom";
import { strings, type LocaleStrings } from "@/i18n/strings";

export interface SkillPanelProps {
  readonly view: MatchView;
  readonly viewerPlayerId: string;
  readonly pending: boolean;
  readonly selection: SkillSelectionState | null;
  readonly resolutions: readonly SkillResolvedPayload[];
  /** Skill button clicked - DOUBLE_CALL/GHOST_CALL cast immediately, WILD_DAUB/CELL_SWAP start cell selection (see /play's page.tsx). */
  readonly onActivateSkill: (effectType: string) => void;
  readonly onCancelSelection: () => void;
  readonly onNullify: () => void;
  readonly onPass: () => void;
}

/**
 * Server/API.md's Nullify window is 15s; the server never sends an exact
 * deadline, so this is a client-only, cosmetic countdown started the moment
 * a new pendingSkill is observed (see `pendingSignature` below) - not
 * authoritative, purely a "hurry up" UX cue.
 */
const NULLIFY_WINDOW_MS = 15_000;

/**
 * Dumb: the in-match skill panel - own loadout with charges (button per
 * skill), status of an armed Double/Ghost Call, the pending-skill Nullify
 * banner (only shows Nullify/Pass buttons when the viewer is actually in
 * `awaiting`, plus a countdown - see NULLIFY_WINDOW_MS above), and a short
 * history of skill:resolved events this session. WILD_DAUB/CELL_SWAP cell
 * picking itself happens on MatchBoard's own board grid (see its
 * skillSelection/onSelectSkillCell props) - this panel only starts/cancels
 * that selection.
 */
export default function SkillPanel({
  view,
  viewerPlayerId,
  pending,
  selection,
  resolutions,
  onActivateSkill,
  onCancelSelection,
  onNullify,
  onPass,
}: SkillPanelProps) {
  const locale = useLocale();
  const t: LocaleStrings["play"]["skills"] = strings[locale].play.skills;
  const loadout = view.loadout ?? [];
  const isMyTurn = view.status === "in_progress" && view.currentTurnPlayerId === viewerPlayerId;
  const iAmAwaiting = view.pendingSkill?.awaiting.includes(viewerPlayerId) ?? false;

  // A new pendingSkill instance is identified by playerId+effectType+how
  // many resolutions have happened so far (resolutions.length increases by
  // 1 each time one resolves) - so the SAME player using the SAME
  // effectType again later still resets the countdown, see NULLIFY_WINDOW_MS.
  const pendingSignature = view.pendingSkill
    ? `${view.pendingSkill.playerId}:${view.pendingSkill.effectType}:${resolutions.length}`
    : null;

  // "Adjust state during render" (see react.dev's "You Might Not Need an
  // Effect") to reset the countdown to the full window the instant a new
  // pendingSkill appears - seeded with the static window length (a pure
  // constant, unlike `Date.now()`, which components must not call during
  // render, see react-hooks/purity). The effect below then corrects
  // `secondsLeft` to the precise remaining time every tick.
  const [prevPendingSignature, setPrevPendingSignature] = useState(pendingSignature);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(
    pendingSignature ? NULLIFY_WINDOW_MS / 1000 : null,
  );
  if (pendingSignature !== prevPendingSignature) {
    setPrevPendingSignature(pendingSignature);
    setSecondsLeft(pendingSignature ? NULLIFY_WINDOW_MS / 1000 : null);
  }

  useEffect(() => {
    if (!pendingSignature) return;
    const deadline = Date.now() + NULLIFY_WINDOW_MS;
    const id = setInterval(() => {
      setSecondsLeft(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    }, 250);
    return () => clearInterval(id);
  }, [pendingSignature]);

  if (loadout.length === 0 && !view.pendingSkill && resolutions.length === 0) return null;

  const skillsDisabled = pending || !isMyTurn || view.pendingSkill !== undefined || selection !== null;

  return (
    <section className="space-y-3 rounded border border-slate-800 bg-slate-900/60 p-3">
      <h2 className="text-lg font-semibold">{t.title}</h2>

      {loadout.length > 0 && (
        <fieldset disabled={skillsDisabled}>
          <legend className="mb-1 text-sm font-semibold text-slate-300">{t.yourSkills}</legend>
          <ul className="flex flex-wrap gap-2">
            {loadout.map((instance, index) => (
              <li
                key={`${instance.effectType}-${index}`}
                className="flex items-center gap-2 rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm"
              >
                <span>
                  {t.effectNames[instance.effectType] ?? instance.effectType} ({instance.chargesLeft} {t.chargesLeft}
                  )
                </span>
                <button
                  type="button"
                  onClick={() => onActivateSkill(instance.effectType)}
                  disabled={instance.chargesLeft <= 0}
                  className="rounded bg-indigo-600 px-2 py-0.5 text-xs font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {t.use}
                </button>
              </li>
            ))}
          </ul>
        </fieldset>
      )}

      {selection && (
        <p className="flex items-center gap-2 rounded bg-amber-600/20 px-2 py-1 text-sm text-amber-300">
          {t.selectPrompt[selection.effectType] ?? selection.effectType} ({selection.cells.length}/
          {selection.cellsNeeded})
          <button
            type="button"
            onClick={onCancelSelection}
            className="rounded border border-amber-500 px-2 py-0.5 text-xs font-semibold hover:bg-amber-600/30"
          >
            {t.cancelSelection}
          </button>
        </p>
      )}

      {view.myTurnArmed?.double && (
        <p className="rounded bg-indigo-600/20 px-2 py-1 text-sm text-indigo-300">
          {t.armedDoublePrefix}
          {view.myTurnArmed.double.callsLeft}
          {t.armedDoubleSuffix}
        </p>
      )}
      {view.myTurnArmed?.ghost && (
        <p className="rounded bg-indigo-600/20 px-2 py-1 text-sm text-indigo-300">{t.armedGhost}</p>
      )}

      {view.pendingSkill && (
        <div role="alert" className="space-y-2 rounded border border-amber-500 bg-amber-600/10 p-2">
          <p className="text-sm text-amber-300">
            {t.pendingLabel}: {t.effectNames[view.pendingSkill.effectType] ?? view.pendingSkill.effectType}
            {secondsLeft !== null && <span className="ml-2 font-mono font-bold">{secondsLeft}s</span>}
          </p>
          {iAmAwaiting && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onNullify}
                disabled={pending}
                className="rounded bg-red-600 px-3 py-1 text-xs font-semibold text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t.nullify}
              </button>
              <button
                type="button"
                onClick={onPass}
                disabled={pending}
                className="rounded border border-slate-600 px-3 py-1 text-xs font-semibold text-slate-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t.pass}
              </button>
            </div>
          )}
        </div>
      )}

      {resolutions.length > 0 && (
        <div>
          <h3 className="mb-1 text-sm font-semibold text-slate-300">{t.historyTitle}</h3>
          <ul className="space-y-0.5 text-xs text-slate-400">
            {resolutions.map((resolution, index) => (
              <li key={index}>
                {t.effectNames[resolution.effectType] ?? resolution.effectType} —{" "}
                {resolution.nullified ? t.wasNullified : t.wasResolved}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

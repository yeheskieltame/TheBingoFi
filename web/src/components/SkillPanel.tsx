import type { MatchView, SkillResolvedPayload } from "@thebingofi/server/protocol";

import type { SkillSelectionState } from "@/hooks/useRoom";
import { strings, type LocaleStrings } from "@/i18n/strings";

const locale = "id";

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
 * Dumb: the in-match skill panel - own loadout with charges (button per
 * skill), status of an armed Double/Ghost Call, the pending-skill Nullify
 * banner (only shows Nullify/Pass buttons when the viewer is actually in
 * `awaiting`), and a short history of skill:resolved events this session.
 * WILD_DAUB/CELL_SWAP cell picking itself happens on MatchBoard's own board
 * grid (see its skillSelection/onSelectSkillCell props) - this panel only
 * starts/cancels that selection.
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
  const t: LocaleStrings["play"]["skills"] = strings[locale].play.skills;
  const loadout = view.loadout ?? [];
  const isMyTurn = view.status === "in_progress" && view.currentTurnPlayerId === viewerPlayerId;
  const iAmAwaiting = view.pendingSkill?.awaiting.includes(viewerPlayerId) ?? false;

  if (loadout.length === 0 && !view.pendingSkill && resolutions.length === 0) return null;

  const skillsDisabled = pending || !isMyTurn || view.pendingSkill !== undefined || selection !== null;

  return (
    <section>
      <h2>{t.title}</h2>

      {loadout.length > 0 && (
        <fieldset disabled={skillsDisabled}>
          <legend>{t.yourSkills}</legend>
          <ul>
            {loadout.map((instance, index) => (
              <li key={`${instance.effectType}-${index}`}>
                {t.effectNames[instance.effectType] ?? instance.effectType} ({instance.chargesLeft} {t.chargesLeft})
                <button
                  type="button"
                  onClick={() => onActivateSkill(instance.effectType)}
                  disabled={instance.chargesLeft <= 0}
                >
                  {t.use}
                </button>
              </li>
            ))}
          </ul>
        </fieldset>
      )}

      {selection && (
        <p>
          {t.selectPrompt[selection.effectType] ?? selection.effectType} ({selection.cells.length}/
          {selection.cellsNeeded})
          <button type="button" onClick={onCancelSelection}>
            {t.cancelSelection}
          </button>
        </p>
      )}

      {view.myTurnArmed?.double && (
        <p>
          {t.armedDoublePrefix}
          {view.myTurnArmed.double.callsLeft}
          {t.armedDoubleSuffix}
        </p>
      )}
      {view.myTurnArmed?.ghost && <p>{t.armedGhost}</p>}

      {view.pendingSkill && (
        <div role="alert">
          <p>
            {t.pendingLabel}: {t.effectNames[view.pendingSkill.effectType] ?? view.pendingSkill.effectType}
          </p>
          {iAmAwaiting && (
            <>
              <button type="button" onClick={onNullify} disabled={pending}>
                {t.nullify}
              </button>
              <button type="button" onClick={onPass} disabled={pending}>
                {t.pass}
              </button>
            </>
          )}
        </div>
      )}

      {resolutions.length > 0 && (
        <div>
          <h3>{t.historyTitle}</h3>
          <ul>
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

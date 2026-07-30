import { useLocale } from "@/hooks/useLocale";
import type { SkillCatalogEntry } from "@/hooks/useSkillCatalog";
import { strings } from "@/i18n/strings";

const MAX_LOADOUT_SIZE = 2;

export interface LoadoutPickerProps {
  readonly catalog: readonly SkillCatalogEntry[];
  readonly ownedSkillIds: ReadonlySet<number>;
  /** In-progress selection (before onSave commits it via loadout:set) - see /play's page.tsx. */
  readonly selected: readonly number[];
  /** Already-saved loadout for the viewer, from LobbyView.players[].loadout, if any. */
  readonly savedLoadout: readonly number[] | undefined;
  readonly catalogLoading: boolean;
  readonly catalogError: string | null;
  readonly saving: boolean;
  readonly onToggle: (skillId: number) => void;
  readonly onSave: () => void;
}

/**
 * Dumb: on-chain skill catalog + ownership as a togglable picker (max 2,
 * owned-only), plus the current saved loadout. Catalog/ownership are read
 * on-chain by /play's page.tsx via hooks/useSkillCatalog.ts +
 * hooks/useSkillOwnership.ts; this component only renders + toggles/saves.
 */
export default function LoadoutPicker({
  catalog,
  ownedSkillIds,
  selected,
  savedLoadout,
  catalogLoading,
  catalogError,
  saving,
  onToggle,
  onSave,
}: LoadoutPickerProps) {
  const locale = useLocale();
  const t = strings[locale].play.lobby;
  // Typed as Record<string, string> (rather than the literal 5-key object
  // TS would otherwise infer) so it can be indexed by an arbitrary
  // effectType string below.
  const effectNames: Record<string, string> = strings[locale].play.skills.effectNames;

  if (catalogLoading) return <p className="text-sm text-slate-400">{t.loadoutCatalogLoading}</p>;
  if (catalogError) return <p className="text-sm text-red-400">{t.loadoutCatalogError}</p>;

  const owned = catalog.filter((entry) => ownedSkillIds.has(entry.skillId));

  return (
    <div className="space-y-3 rounded border border-slate-800 bg-slate-900/60 p-3">
      <h3 className="text-sm font-semibold text-slate-200">
        {t.loadoutPickerTitle} ({selected.length}/{MAX_LOADOUT_SIZE})
      </h3>

      {savedLoadout && savedLoadout.length > 0 && (
        <p className="text-xs text-emerald-400">
          {t.loadoutSaved}: {savedLoadout.map((id) => effectNames[catalog.find((c) => c.skillId === id)?.effectType ?? ""] ?? id).join(", ")}
        </p>
      )}

      {owned.length === 0 ? (
        <p className="text-xs text-slate-400">{t.loadoutNoneOwned}</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {owned.map((entry) => {
            const isSelected = selected.includes(entry.skillId);
            const disabled = !entry.active || (!isSelected && selected.length >= MAX_LOADOUT_SIZE);
            return (
              <li key={entry.skillId}>
                <button
                  type="button"
                  aria-pressed={isSelected}
                  disabled={disabled || saving}
                  onClick={() => onToggle(entry.skillId)}
                  className={`rounded border px-3 py-2 text-left text-xs transition-colors ${
                    isSelected
                      ? "border-emerald-500 bg-emerald-600/20 text-emerald-200"
                      : "border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
                  } disabled:cursor-not-allowed disabled:opacity-40`}
                >
                  <div className="font-semibold">{effectNames[entry.effectType] ?? entry.effectType}</div>
                  <div className="text-slate-400">
                    #{entry.skillId} · {entry.charges}x · rarity {entry.rarity}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {saving ? t.loadoutSaving : t.loadoutSave}
      </button>
    </div>
  );
}

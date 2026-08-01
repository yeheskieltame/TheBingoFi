"use client";

import { useMemo, useState } from "react";

import PlazaComposer from "@/components/PlazaComposer";
import PlazaFeed from "@/components/PlazaFeed";
import { useLocale } from "@/hooks/useLocale";
import { useMarketplaceSales } from "@/hooks/useMarketplaceSales";
import { usePlaza } from "@/hooks/usePlaza";
import { useSkillCatalog } from "@/hooks/useSkillCatalog";
import { useSkillOwnership } from "@/hooks/useSkillOwnership";
import { useWallet } from "@/hooks/useWallet";
import { strings } from "@/i18n/strings";
import { tierForMaxSupply, type SkillTier } from "@/lib/skillTier";
import { getStoredNickname, setStoredNickname } from "@/lib/storage";

/**
 * Global social feed (CONCEPT.md §7.4b "Plaza") - guest play works fully for
 * posting/replying; connecting a wallet only unlocks attaching an owned
 * skill to a post ("pamer skill"). Nickname comes from the same localStorage
 * key /play and /daily use (lib/storage.ts) - if it's empty, this page asks
 * for one inline rather than bouncing to "/" (same "ajak isi" pattern as
 * /daily's inline nickname field), so a first-time visitor can land
 * straight on /plaza and still read/join the feed.
 */
export default function PlazaPage() {
  const locale = useLocale();
  const t = strings[locale].plaza;
  const wallet = useWallet();
  const plaza = usePlaza();

  const [nickname, setNickname] = useState(() => getStoredNickname());
  const [nicknameDraft, setNicknameDraft] = useState(() => getStoredNickname());

  // Catalog is fetched regardless of wallet connection: any post/reply in
  // history may reference a skillId owned by someone ELSE, and rendering
  // its card (name/tier) needs the catalog either way. Only *which* skills
  // populate the "attach" dropdown depends on the connected wallet's
  // ownership (see ownership below).
  const catalog = useSkillCatalog();
  const catalogSkillIds = useMemo(() => catalog.catalog?.map((entry) => entry.skillId) ?? [], [catalog.catalog]);
  const sales = useMarketplaceSales(catalogSkillIds); // maxSupply -> tier, see skillTier() below
  const ownership = useSkillOwnership(wallet.address, catalogSkillIds);

  const effectNames: Record<string, string> = strings[locale].play.skills.effectNames;
  const catalogById = useMemo(
    () => new Map((catalog.catalog ?? []).map((entry) => [entry.skillId, entry] as const)),
    [catalog.catalog],
  );
  const ownedSkills = (catalog.catalog ?? []).filter((entry) => (ownership.balances.get(entry.skillId) ?? 0n) > 0n);

  function skillName(skillId: number): string {
    const entry = catalogById.get(skillId);
    if (!entry) return `Skill #${skillId}`;
    return effectNames[entry.effectType] ?? entry.effectType;
  }

  function skillTier(skillId: number): SkillTier | undefined {
    const sale = sales.sales.get(skillId);
    return sale ? tierForMaxSupply(sale.maxSupply) : undefined;
  }

  function handleSaveNickname(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = nicknameDraft.trim();
    if (!trimmed) return;
    setStoredNickname(trimmed);
    setNickname(trimmed);
  }

  return (
    <main className="mx-auto max-w-2xl space-y-4 py-4 sm:py-6">

      <header className="text-center">
        <h1 className="font-display text-xl font-bold tracking-tight text-frost sm:text-3xl">{t.title}</h1>
        <p className="mx-auto max-w-md text-sm text-frost/60">{t.subtitle}</p>
      </header>

      {plaza.error && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-2xl border border-red-500/40 bg-red-950/60 px-4 py-2.5 text-sm text-red-200 backdrop-blur-md"
        >
          <span>{plaza.error}</span>
          <button
            type="button"
            onClick={plaza.clearError}
            className="shrink-0 rounded-full border border-red-400/50 px-3 py-0.5 font-display text-xs font-semibold hover:bg-red-900/60"
          >
            {strings[locale].common.dismiss}
          </button>
        </div>
      )}

      {/* Nickname gate closes ONLY the composer, never the feed below - see
          this page's doc + web/README.md: a first-time visitor without a
          nickname still sees every post/reply, just can't post/reply yet. */}
      {!nickname ? (
        <form onSubmit={handleSaveNickname} className="space-y-3 rounded-3xl border border-white/10 bg-night/55 p-5 backdrop-blur-md">
          <label htmlFor="plaza-nickname" className="block font-display text-sm font-bold text-frost">
            {t.nicknamePrompt}
          </label>
          <div className="flex gap-2">
            <input
              id="plaza-nickname"
              value={nicknameDraft}
              onChange={(event) => setNicknameDraft(event.target.value)}
              placeholder={t.nicknameLabel}
              className="flex-1 rounded-full border border-white/15 bg-night/60 px-4 py-2 text-frost placeholder:text-ice/35 focus:border-white/35 focus:outline-none"
            />
            <button
              type="submit"
              disabled={!nicknameDraft.trim()}
              className="rounded-full bg-glacier-deep px-6 py-2 font-display text-sm font-bold text-frost transition-colors hover:bg-glacier disabled:cursor-not-allowed disabled:opacity-30"
            >
              {t.nicknameSave}
            </button>
          </div>
        </form>
      ) : (
        <div className="space-y-2">
          {wallet.isConnected ? (
            ownedSkills.length === 0 && <p className="px-1 text-xs text-ice/45">{t.noSkillsOwned}</p>
          ) : (
            <p className="px-1 text-xs text-ice/45">{t.connectForSkills}</p>
          )}

          <PlazaComposer
            nickname={nickname}
            placeholder={t.composerPlaceholder}
            submitLabel={t.send}
            sending={plaza.sending}
            onSubmit={(text, skillId) => plaza.send(nickname, text, skillId)}
            skillPicker={
              ownedSkills.length > 0
                ? {
                    label: t.attachSkillLabel,
                    noneLabel: t.attachSkillNone,
                    options: ownedSkills.map((entry) => ({
                      skillId: entry.skillId,
                      label: `${skillName(entry.skillId)} (#${entry.skillId})`,
                    })),
                  }
                : undefined
            }
          />
        </div>
      )}

      <PlazaFeed
        threads={plaza.threads}
        skillName={skillName}
        skillTier={skillTier}
        nickname={nickname}
        sending={plaza.sending}
        onReply={(parentId, text, skillId) => plaza.reply(nickname, text, parentId, skillId)}
      />
    </main>
  );
}

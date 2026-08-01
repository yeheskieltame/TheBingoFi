"use client";

import { useMemo, useState } from "react";

import PlazaMessageList from "@/components/PlazaMessageList";
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
 * Global social chat (CONCEPT.md §7.4b "Plaza") - guest play works fully
 * for text chat; connecting a wallet only unlocks attaching an owned skill
 * to a message ("pamer skill"). Nickname comes from the same localStorage
 * key /play and /daily use (lib/storage.ts) - if it's empty, this page asks
 * for one inline rather than bouncing to "/" (same "ajak isi" pattern as
 * /daily's inline nickname field), so a first-time visitor can land
 * straight on /plaza and still start chatting.
 */
export default function PlazaPage() {
  const locale = useLocale();
  const t = strings[locale].plaza;
  const wallet = useWallet();
  const plaza = usePlaza();

  const [nickname, setNickname] = useState(() => getStoredNickname());
  const [nicknameDraft, setNicknameDraft] = useState(() => getStoredNickname());
  const [text, setText] = useState("");
  const [attachedSkillId, setAttachedSkillId] = useState<number | "">("");

  // Catalog is fetched regardless of wallet connection: any message in
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

  function handleSend(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || !nickname) return;
    plaza.send(nickname, trimmed, attachedSkillId === "" ? undefined : attachedSkillId);
    setText("");
    setAttachedSkillId("");
  }

  return (
    <main className="mx-auto max-w-2xl space-y-4 py-4 sm:py-6">

      <header className="text-center">
        <h1 className="font-display text-xl font-bold tracking-tight text-frost sm:text-3xl">{t.title}</h1>
        <p className="mx-auto max-w-md text-sm text-frost/60">{t.subtitle}</p>
      </header>

      {/* Riwayat chat tampil untuk SEMUA pengunjung, termasuk yang belum punya
          nickname. Sebelumnya seluruh daftar ikut tersembunyi di balik form
          nickname, jadi pendatang baru selalu melihat ruangan kosong: kebalikan
          dari fungsi ruang sosial. Gerbang nickname sekarang hanya menutup
          kolom kirim. */}
      <PlazaMessageList messages={plaza.messages} skillName={skillName} skillTier={skillTier} />

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
        <>
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

          <form onSubmit={handleSend} className="space-y-2">
            {wallet.isConnected ? (
              ownedSkills.length > 0 ? (
                <div className="flex flex-wrap items-center gap-2 text-xs text-ice/55">
                  <label htmlFor="plaza-attach-skill">{t.attachSkillLabel}</label>
                  <select
                    id="plaza-attach-skill"
                    value={attachedSkillId}
                    onChange={(event) => setAttachedSkillId(event.target.value === "" ? "" : Number(event.target.value))}
                    className="rounded-full border border-white/15 bg-night/60 px-3 py-1 font-display text-ice"
                  >
                    <option value="">{t.attachSkillNone}</option>
                    {ownedSkills.map((entry) => (
                      <option key={entry.skillId} value={entry.skillId}>
                        {skillName(entry.skillId)} (#{entry.skillId})
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <p className="text-xs text-ice/45">{t.noSkillsOwned}</p>
              )
            ) : (
              <p className="text-xs text-ice/45">{t.connectForSkills}</p>
            )}

            <div className="flex gap-2">
              <label htmlFor="plaza-text" className="sr-only">
                {t.composerPlaceholder}
              </label>
              <input
                id="plaza-text"
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder={t.composerPlaceholder}
                maxLength={280}
                className="flex-1 rounded-full border border-white/15 bg-night/60 px-4 py-2.5 text-frost backdrop-blur-md placeholder:text-ice/35 focus:border-white/35 focus:outline-none"
              />
              <button
                type="submit"
                disabled={plaza.sending || !text.trim()}
                className="rounded-full bg-glacier-deep px-6 py-2.5 font-display text-sm font-bold text-frost transition-colors hover:bg-glacier disabled:cursor-not-allowed disabled:opacity-30"
              >
                {t.send}
              </button>
            </div>
          </form>
        </>
      )}
    </main>
  );
}

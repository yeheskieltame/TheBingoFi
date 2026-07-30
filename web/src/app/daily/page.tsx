"use client";

import { useState } from "react";

import DailyLeaderboard from "@/components/DailyLeaderboard";
import DailyResult from "@/components/DailyResult";
import DraftBoard from "@/components/DraftBoard";
import { useDailyChallenge } from "@/hooks/useDailyChallenge";
import { useDraftBoard } from "@/hooks/useDraftBoard";
import { useLocale } from "@/hooks/useLocale";
import { strings } from "@/i18n/strings";
import { getStoredNickname, setStoredNickname } from "@/lib/storage";

export default function DailyPage() {
  const locale = useLocale();
  const t = strings[locale].daily;
  const daily = useDailyChallenge();
  const draft = useDraftBoard();
  const [nickname, setNickname] = useState(() => getStoredNickname());
  const [copied, setCopied] = useState(false);

  function handlePlay(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = nickname.trim();
    if (!trimmed || !draft.validation.valid) return;
    setStoredNickname(trimmed);
    daily.play(trimmed, draft.numbers);
  }

  function handleCopy() {
    if (!daily.result) return;
    navigator.clipboard.writeText(daily.result.shareCard).then(() => {
      setCopied(true);
    });
  }

  return (
    <main className="mx-auto max-w-md space-y-6">
      <h1 className="text-2xl font-bold">{t.title}</h1>

      {daily.today ? (
        <p className="text-sm text-slate-400">
          {t.challengeNumber} #{daily.today.number} — {daily.today.date}
        </p>
      ) : !daily.error ? (
        <p className="text-sm text-slate-500">{strings[locale].common.loading}</p>
      ) : null}

      {daily.error && (
        <p role="alert" className="rounded border border-red-600 bg-red-950/60 px-3 py-2 text-sm text-red-300">
          {daily.error}
        </p>
      )}

      {!daily.result && (
        <form onSubmit={handlePlay} className="space-y-4">
          <fieldset className="space-y-1">
            <legend className="text-sm font-semibold text-slate-300">{t.nicknameLabel}</legend>
            <label htmlFor="daily-nickname" className="sr-only">
              {t.nicknameLabel}
            </label>
            <input
              id="daily-nickname"
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              placeholder={t.nicknameLabel}
              className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-white placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </fieldset>

          <DraftBoard
            numbers={draft.numbers}
            selectedIndex={draft.selectedIndex}
            onSelectCell={draft.selectCell}
            onShuffle={draft.shuffle}
            valid={draft.validation.valid}
            validationError={draft.validation.error}
          />

          <button
            type="submit"
            disabled={daily.pending || !draft.validation.valid || !nickname.trim()}
            className="w-full rounded bg-emerald-600 px-4 py-2 font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {daily.pending ? strings[locale].common.loading : t.play}
          </button>
        </form>
      )}

      {daily.result && (
        <DailyResult
          number={daily.result.number}
          score={daily.result.score}
          callsToBingo={daily.result.callsToBingo}
          shareCard={daily.result.shareCard}
          copied={copied}
          onCopy={handleCopy}
        />
      )}

      {daily.leaderboard ? (
        <DailyLeaderboard entries={daily.leaderboard} />
      ) : (
        !daily.error && <p className="text-sm text-slate-500">{strings[locale].common.loading}</p>
      )}
    </main>
  );
}

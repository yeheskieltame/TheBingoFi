"use client";

import { useState } from "react";

import DailyLeaderboard from "@/components/DailyLeaderboard";
import DailyResult from "@/components/DailyResult";
import DraftBoard from "@/components/DraftBoard";
import { useDailyChallenge } from "@/hooks/useDailyChallenge";
import { useDraftBoard } from "@/hooks/useDraftBoard";
import { strings } from "@/i18n/strings";
import { getStoredNickname, setStoredNickname } from "@/lib/storage";

const locale = "id";

export default function DailyPage() {
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
    <main>
      <h1>{t.title}</h1>

      {daily.today && (
        <p>
          {t.challengeNumber} #{daily.today.number} — {daily.today.date}
        </p>
      )}

      {daily.error && <p role="alert">{daily.error}</p>}

      {!daily.result && (
        <form onSubmit={handlePlay}>
          <fieldset>
            <legend>{t.nicknameLabel}</legend>
            <label htmlFor="daily-nickname">{t.nicknameLabel}</label>
            <input id="daily-nickname" value={nickname} onChange={(event) => setNickname(event.target.value)} />
          </fieldset>

          <DraftBoard
            numbers={draft.numbers}
            selectedIndex={draft.selectedIndex}
            onSelectCell={draft.selectCell}
            onShuffle={draft.shuffle}
            valid={draft.validation.valid}
            validationError={draft.validation.error}
          />

          <button type="submit" disabled={daily.pending || !draft.validation.valid || !nickname.trim()}>
            {t.play}
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

      {daily.leaderboard && <DailyLeaderboard entries={daily.leaderboard} />}
    </main>
  );
}

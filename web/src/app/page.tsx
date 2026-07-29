"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { strings } from "@/i18n/strings";
import { getStoredNickname, setStoredNickname } from "@/lib/storage";

const locale = "id";

export default function Home() {
  const t = strings[locale].landing;
  const router = useRouter();
  // Lazy initializer (not an effect): safe here because it only ever feeds
  // an <input value=...>, and React does not hydration-check controlled
  // form element values (browsers may already alter them, e.g. autofill).
  const [nickname, setNickname] = useState(() => getStoredNickname());
  const [joinCode, setJoinCode] = useState("");

  function handleNicknameChange(value: string) {
    setNickname(value);
    setStoredNickname(value);
  }

  function handleCreateRoom(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = nickname.trim();
    if (!trimmed) return;
    setStoredNickname(trimmed);
    router.push("/play");
  }

  function handleJoinRoom(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedNickname = nickname.trim();
    const trimmedCode = joinCode.trim();
    if (!trimmedNickname || !trimmedCode) return;
    setStoredNickname(trimmedNickname);
    router.push(`/play?code=${encodeURIComponent(trimmedCode)}`);
  }

  return (
    <main>
      <h1>{t.title}</h1>
      <p>{t.tagline}</p>

      <fieldset>
        <legend>{t.nicknameLabel}</legend>
        <label htmlFor="nickname">{t.nicknameLabel}</label>
        <input
          id="nickname"
          name="nickname"
          value={nickname}
          onChange={(event) => handleNicknameChange(event.target.value)}
        />
      </fieldset>

      <form onSubmit={handleCreateRoom}>
        <button type="submit" disabled={!nickname.trim()}>
          {t.createRoom}
        </button>
      </form>

      <form onSubmit={handleJoinRoom}>
        <label htmlFor="joinCode">{t.joinCodeLabel}</label>
        <input id="joinCode" name="joinCode" value={joinCode} onChange={(event) => setJoinCode(event.target.value)} />
        <button type="submit" disabled={!nickname.trim() || !joinCode.trim()}>
          {t.joinRoom}
        </button>
      </form>

      <nav>
        <ul>
          <li>
            <Link href="/daily">{t.dailyLink}</Link>
          </li>
          <li>
            <Link href="/quests">{t.questsLink}</Link>
          </li>
        </ul>
      </nav>

      <button type="button" disabled>
        {t.ctaConnectWallet} {t.walletComingSoon}
      </button>
    </main>
  );
}

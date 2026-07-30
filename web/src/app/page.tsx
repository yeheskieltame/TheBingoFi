"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useLocale } from "@/hooks/useLocale";
import { strings } from "@/i18n/strings";
import { getStoredNickname, setStoredNickname } from "@/lib/storage";

export default function Home() {
  const locale = useLocale();
  const t = strings[locale].landing;
  const router = useRouter();
  // Lazy initializer (not an effect): safe here because it only ever feeds
  // an <input value=...>, and React does not hydration-check controlled
  // form element values (browsers may already alter them, e.g. autofill).
  const [nickname, setNickname] = useState(() => getStoredNickname());
  const [joinCode, setJoinCode] = useState("");
  const [mode, setMode] = useState<"casual" | "standard">("casual");

  function handleNicknameChange(value: string) {
    setNickname(value);
    setStoredNickname(value);
  }

  function handleCreateRoom(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = nickname.trim();
    if (!trimmed) return;
    setStoredNickname(trimmed);
    router.push(mode === "standard" ? "/play?mode=standard" : "/play");
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
    <main className="mx-auto max-w-md space-y-8">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-bold text-white">{t.title}</h1>
        <p className="text-slate-400">{t.tagline}</p>
      </div>

      <fieldset className="space-y-1">
        <legend className="text-sm font-semibold text-slate-300">{t.nicknameLabel}</legend>
        <label htmlFor="nickname" className="sr-only">
          {t.nicknameLabel}
        </label>
        <input
          id="nickname"
          name="nickname"
          value={nickname}
          onChange={(event) => handleNicknameChange(event.target.value)}
          placeholder={t.nicknameLabel}
          className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-white placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </fieldset>

      <form onSubmit={handleCreateRoom} className="space-y-3 rounded border border-slate-800 bg-slate-900/60 p-4">
        <fieldset className="space-y-1">
          <legend className="text-sm font-semibold text-slate-300">{t.modeLabel}</legend>
          <label className="flex items-center gap-2 text-sm text-slate-200">
            <input
              type="radio"
              name="mode"
              checked={mode === "casual"}
              onChange={() => setMode("casual")}
              className="accent-indigo-500"
            />
            {t.modeCasual}
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-200">
            <input
              type="radio"
              name="mode"
              checked={mode === "standard"}
              onChange={() => setMode("standard")}
              className="accent-indigo-500"
            />
            {t.modeStandard}
          </label>
          {mode === "standard" && <p className="text-xs text-amber-400">{t.modeStandardHint}</p>}
        </fieldset>

        <button
          type="submit"
          disabled={!nickname.trim()}
          className="w-full rounded bg-emerald-600 px-4 py-2 font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t.createRoom}
        </button>
      </form>

      <form onSubmit={handleJoinRoom} className="flex items-end gap-2">
        <div className="flex-1 space-y-1">
          <label htmlFor="joinCode" className="text-sm font-semibold text-slate-300">
            {t.joinCodeLabel}
          </label>
          <input
            id="joinCode"
            name="joinCode"
            value={joinCode}
            onChange={(event) => setJoinCode(event.target.value)}
            placeholder="ABC123"
            className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 uppercase text-white placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <button
          type="submit"
          disabled={!nickname.trim() || !joinCode.trim()}
          className="rounded bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t.joinRoom}
        </button>
      </form>

      <nav aria-label={t.title}>
        <ul className="flex flex-wrap justify-center gap-3 text-sm">
          <li>
            <Link href="/daily" className="text-indigo-400 hover:underline">
              {t.dailyLink}
            </Link>
          </li>
          <li>
            <Link href="/quests" className="text-indigo-400 hover:underline">
              {t.questsLink}
            </Link>
          </li>
          <li>
            <Link href="/market" className="text-indigo-400 hover:underline">
              {t.marketLink}
            </Link>
          </li>
        </ul>
      </nav>
    </main>
  );
}

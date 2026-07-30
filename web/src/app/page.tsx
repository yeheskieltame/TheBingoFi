"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useLocale } from "@/hooks/useLocale";
import { strings } from "@/i18n/strings";
import { getStoredNickname, setStoredNickname } from "@/lib/storage";

const MODES = ["casual", "standard"] as const;

const FOOTER_LINKS = [
  { href: "/daily", key: "dailyLink" },
  { href: "/quests", key: "questsLink" },
  { href: "/market", key: "marketLink" },
] as const;

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
    <main className="pb-10">
      {/* Satu kartu hero: art + judul + form masuk, tanpa panel terpisah. */}
      <section className="relative overflow-hidden rounded-3xl">
        {/* scale-105 memotong bingkai hitam yang sudah ter-bake di bg.png supaya
            tidak muncul "kotak di dalam kotak" terhadap frame gelap halaman. */}
        <Image
          src="/images/background/bg.png"
          alt=""
          fill
          priority
          sizes="100vw"
          className="scale-105 object-cover object-center"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-night/30 via-night/10 to-night/75" />

        <div className="relative flex min-h-[460px] flex-col items-center justify-center gap-6 px-6 py-24 text-center sm:min-h-[560px]">
          <div className="space-y-3">
            <h1 className="font-display text-[2.6rem] font-bold leading-[1.1] tracking-tight text-frost sm:text-6xl">
              {t.heroTitle}
            </h1>
            <p className="font-display text-lg font-medium text-frost/70 sm:text-xl">{t.heroSubtitle}</p>
          </div>

          <form
            onSubmit={handleCreateRoom}
            className="flex w-full max-w-md flex-col items-center gap-3 sm:flex-row"
          >
            <label htmlFor="nickname" className="sr-only">
              {t.nicknameLabel}
            </label>
            <input
              id="nickname"
              name="nickname"
              value={nickname}
              onChange={(event) => handleNicknameChange(event.target.value)}
              placeholder={t.nicknamePlaceholder}
              className="w-full flex-1 rounded-full bg-frost/95 px-5 py-3 font-display text-lg font-medium text-glacier-ink placeholder:text-glacier-deep/40 focus:outline-none focus:ring-2 focus:ring-frost"
            />
            <button
              type="submit"
              disabled={!nickname.trim()}
              className="w-full rounded-full bg-glacier-deep px-8 py-3 font-display text-lg font-bold text-frost transition-colors hover:bg-glacier disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            >
              {t.createRoom}
            </button>
          </form>

          {/* Mode: dua chip kecil, hint hanya muncul untuk Standard. */}
          <fieldset className="flex flex-col items-center gap-2">
            <legend className="sr-only">{t.modeLabel}</legend>
            <div className="flex gap-1 rounded-full bg-night/40 p-1 backdrop-blur-sm">
              {MODES.map((value) => (
                <label
                  key={value}
                  className={`cursor-pointer rounded-full px-4 py-1.5 font-display text-base font-semibold transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-frost/60 ${
                    mode === value ? "bg-frost text-glacier-ink" : "text-frost/70 hover:text-frost"
                  }`}
                >
                  <input
                    type="radio"
                    name="mode"
                    className="sr-only"
                    checked={mode === value}
                    onChange={() => setMode(value)}
                  />
                  {value === "casual" ? t.modeCasual : t.modeStandard}
                </label>
              ))}
            </div>
            {mode === "standard" && <p className="text-xs text-frost/60">{t.modeStandardHint}</p>}
          </fieldset>
        </div>
      </section>

      {/* Gabung via kode: baris tipis, tanpa kartu. */}
      <form onSubmit={handleJoinRoom} className="mx-auto mt-8 flex max-w-md items-center gap-2">
        <label htmlFor="joinCode" className="shrink-0 font-display text-base font-medium text-ice/60">
          {t.joinPrompt}
        </label>
        <input
          id="joinCode"
          name="joinCode"
          value={joinCode}
          onChange={(event) => setJoinCode(event.target.value)}
          placeholder="ABC123"
          aria-label={t.joinCodeLabel}
          className="min-w-0 flex-1 rounded-full border border-white/10 bg-white/5 px-4 py-2 font-mono text-sm uppercase tracking-widest text-frost placeholder:tracking-normal placeholder:text-ice/30 focus:border-white/30 focus:outline-none"
        />
        <button
          type="submit"
          disabled={!nickname.trim() || !joinCode.trim()}
          className="shrink-0 rounded-full px-4 py-2 font-display text-base font-semibold text-ice transition-colors hover:text-frost disabled:cursor-not-allowed disabled:opacity-30"
        >
          {t.joinRoom}
        </button>
      </form>

      <nav aria-label={t.title} className="mt-10">
        <ul className="flex items-center justify-center gap-6 font-display text-base font-medium text-ice/50">
          {FOOTER_LINKS.map((entry) => (
            <li key={entry.href}>
              <Link href={entry.href} className="transition-colors hover:text-frost">
                {t[entry.key]}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </main>
  );
}

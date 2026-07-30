"use client";

import { MAX_PLAYERS, MIN_PLAYERS } from "@thebingofi/server/engine";
import type { RoomSummary } from "@thebingofi/server/protocol";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { useLocale } from "@/hooks/useLocale";
import { useRoom } from "@/hooks/useRoom";
import { strings } from "@/i18n/strings";
import { getStoredNickname, setStoredNickname } from "@/lib/storage";

/** Player-count choices for Quick Match / Create Room segmented buttons - CONCEPT.md §2b's "2-5 pemain". */
const PLAYER_COUNTS = Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, i) => MIN_PLAYERS + i);
/** Bot difficulty ladder, 1 (near-random) to 10 (always optimal) - server's bot/bot.ts MIN_BOT_LEVEL/MAX_BOT_LEVEL, mirrored here since that module isn't exported to the client. */
const BOT_LEVELS = Array.from({ length: 10 }, (_, i) => i + 1);
/** Room Browser auto-refresh interval (manual refresh button always available too). */
const ROOM_LIST_POLL_MS = 10_000;

/** Link sekunder di kaki halaman - konten murni presentasional, jadi ikut di file ini. */
const FOOTER_LINKS = [
  { href: "/daily", key: "dailyLink" },
  { href: "/quests", key: "questsLink" },
  { href: "/market", key: "marketLink" },
] as const;

/**
 * Landing page: pick a nickname, then pick HOW to get into a match - Quick
 * Match (VS Player), an open public room from the browser, a manually
 * configured room, or VS Bot (CONCEPT.md §2b "Masuk Match Tanpa Nunggu").
 * Every path here only ever navigates to /play with query params (?quick=,
 * ?bot=, ?code=, ?mode=&maxPlayers=&public=) - the actual room:create/
 * room:quick/room:createBot/room:join socket calls happen once on /play's
 * mount (hooks/useRoom.ts + app/play/page.tsx), never here, so a single
 * socket connection owns the whole room session from creation onward. The
 * one exception is the Room Browser list itself (room:list), which this
 * page issues directly since it's read-only and needs to live-poll while
 * the user is still deciding.
 */
export default function Home() {
  const locale = useLocale();
  const t = strings[locale].landing;
  const router = useRouter();
  const { listRooms } = useRoom();

  // Lazy initializer (not an effect): safe here because it only ever feeds
  // an <input value=...>, and React does not hydration-check controlled
  // form element values (browsers may already alter them, e.g. autofill).
  const [nickname, setNickname] = useState(() => getStoredNickname());
  const trimmedNickname = nickname.trim();
  const hasNickname = trimmedNickname.length > 0;

  const [joinCode, setJoinCode] = useState("");

  const [createSize, setCreateSize] = useState<number>(MAX_PLAYERS);
  const [createMode, setCreateMode] = useState<"casual" | "standard">("casual");
  const [createPublic, setCreatePublic] = useState(false);

  const [rooms, setRooms] = useState<readonly RoomSummary[] | null>(null);
  const [roomsError, setRoomsError] = useState<string | null>(null);
  const [roomsLoading, setRoomsLoading] = useState(false);

  // Only sets state from inside the promise callbacks (never synchronously
  // at the top) - safe to call directly from the effect below (initial
  // fetch + 10s poll) per react-hooks/set-state-in-effect. The "loading"
  // flag is tracked separately by handleRefreshRooms below (a plain click
  // handler, not an effect), so the background poll never flickers a
  // loading state - only an explicit manual refresh does.
  const fetchRooms = useCallback(() => {
    return listRooms()
      .then((list) => {
        setRooms(list);
        setRoomsError(null);
      })
      .catch((err: unknown) => {
        setRoomsError(err instanceof Error ? err.message : "Failed to load rooms");
      });
  }, [listRooms]);

  useEffect(() => {
    fetchRooms();
    const interval = setInterval(fetchRooms, ROOM_LIST_POLL_MS);
    return () => clearInterval(interval);
  }, [fetchRooms]);

  function handleRefreshRooms() {
    setRoomsLoading(true);
    fetchRooms().finally(() => setRoomsLoading(false));
  }

  function handleNicknameChange(value: string) {
    setNickname(value);
    setStoredNickname(value);
  }

  function goToPlay(query: string) {
    setStoredNickname(trimmedNickname);
    router.push(`/play${query}`);
  }

  function handleQuickMatch(size: number) {
    if (!hasNickname) return;
    goToPlay(`?quick=${size}`);
  }

  function handleVsBot(level: number) {
    if (!hasNickname) return;
    goToPlay(`?bot=${level}`);
  }

  function handleJoinRoom(code: string) {
    const trimmedCode = code.trim();
    if (!hasNickname || !trimmedCode) return;
    goToPlay(`?code=${encodeURIComponent(trimmedCode)}`);
  }

  function handleCreateRoom(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hasNickname) return;
    const params = new URLSearchParams();
    if (createMode === "standard") params.set("mode", "standard");
    params.set("maxPlayers", String(createSize));
    if (createPublic) params.set("public", "1");
    goToPlay(`?${params.toString()}`);
  }

  function handleJoinByCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    handleJoinRoom(joinCode);
  }


  return (
    <main className="mx-auto max-w-4xl space-y-6 py-4">
      {/* Hero: art salju + identitas + nickname (satu-satunya input yang wajib
          diisi sebelum semua jalur masuk match di bawah aktif). */}
      <section className="relative overflow-hidden rounded-3xl ring-1 ring-white/10">
        <Image
          src="/images/background/bg.png"
          alt=""
          fill
          priority
          sizes="100vw"
          className="scale-105 object-cover object-center"
        />
        <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-night/35 via-night/25 to-night/85" />

        <div className="relative flex flex-col items-center gap-5 px-5 py-14 text-center sm:py-20">
          <div className="space-y-2">
            <h1 className="font-display text-3xl font-bold leading-tight tracking-tight text-frost sm:text-5xl">
              {t.heroTitle}
            </h1>
            <p className="font-display text-base font-medium text-frost/70 sm:text-lg">{t.heroSubtitle}</p>
          </div>

          <div className="w-full max-w-sm space-y-1.5">
            <label htmlFor="nickname" className="sr-only">
              {t.nicknameLabel}
            </label>
            <input
              id="nickname"
              name="nickname"
              value={nickname}
              onChange={(event) => handleNicknameChange(event.target.value)}
              placeholder={t.nicknamePlaceholder}
              className="w-full rounded-full bg-frost/95 px-5 py-2.5 text-center font-display font-medium text-glacier-ink placeholder:text-glacier-deep/40 focus:outline-none focus:ring-2 focus:ring-frost"
            />
            {!hasNickname && <p className="text-xs text-amber-200">{t.nicknameRequiredHint}</p>}
          </div>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2">
        {/* 1. Quick Match (VS Player) */}
        <section className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4">
          <div>
            <h2 className="font-display text-base font-bold text-frost">{t.quickMatch.title}</h2>
            <p className="text-xs text-ice/55">{t.quickMatch.desc}</p>
          </div>
          <div className="space-y-1.5">
            <p className="text-xs uppercase tracking-wide text-ice/45">{t.quickMatch.sizeLabel}</p>
            <div className="flex flex-wrap gap-2">
              {PLAYER_COUNTS.map((size) => (
                <button
                  key={size}
                  type="button"
                  disabled={!hasNickname}
                  onClick={() => handleQuickMatch(size)}
                  className="size-9 rounded-full bg-glacier-deep font-display text-sm font-bold text-frost transition-colors hover:bg-glacier disabled:cursor-not-allowed disabled:opacity-30"
                >
                  {size}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* 4. VS Bot */}
        <section className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4">
          <div>
            <h2 className="font-display text-base font-bold text-frost">{t.vsBot.title}</h2>
            <p className="text-xs text-ice/55">{t.vsBot.desc}</p>
          </div>
          <div className="space-y-1.5">
            <p className="text-xs uppercase tracking-wide text-ice/45">{t.vsBot.levelLabel}</p>
            <div className="grid grid-cols-5 gap-1.5">
              {BOT_LEVELS.map((level) => (
                <button
                  key={level}
                  type="button"
                  disabled={!hasNickname}
                  onClick={() => handleVsBot(level)}
                  className="rounded-xl border border-white/15 py-1.5 font-display text-sm font-bold text-ice transition-colors hover:border-white/35 hover:text-frost disabled:cursor-not-allowed disabled:opacity-30"
                >
                  {level}
                </button>
              ))}
            </div>
            <p className="text-xs text-ice/45">{t.vsBot.levelHint}</p>
            <p className="text-xs text-ice/45">{t.vsBot.questHint}</p>
          </div>
        </section>

        {/* 3. Buat Room (manual create) */}
        <form onSubmit={handleCreateRoom} className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4">
          <div>
            <h2 className="font-display text-base font-bold text-frost">{t.createRoom.title}</h2>
            <p className="text-xs text-ice/55">{t.createRoom.desc}</p>
          </div>

          <fieldset className="space-y-1.5">
            <legend className="text-xs uppercase tracking-wide text-ice/45">
              {t.createRoom.targetPlayersLabel}
            </legend>
            <div className="flex flex-wrap gap-2">
              {PLAYER_COUNTS.map((size) => (
                <button
                  key={size}
                  type="button"
                  aria-pressed={createSize === size}
                  onClick={() => setCreateSize(size)}
                  className={`size-9 rounded-full font-display text-sm font-bold transition-colors ${
                    createSize === size
                      ? "bg-frost text-glacier-ink"
                      : "border border-white/15 text-ice hover:border-white/35 hover:text-frost"
                  }`}
                >
                  {size}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="space-y-1">
            <legend className="text-xs uppercase tracking-wide text-ice/45">{t.createRoom.modeLabel}</legend>
            <label className="flex items-center gap-2 text-sm text-frost/80">
              <input
                type="radio"
                name="createMode"
                checked={createMode === "casual"}
                onChange={() => setCreateMode("casual")}
                className="accent-glacier"
              />
              {t.createRoom.modeCasual}
            </label>
            <label className="flex items-center gap-2 text-sm text-frost/80">
              <input
                type="radio"
                name="createMode"
                checked={createMode === "standard"}
                onChange={() => setCreateMode("standard")}
                className="accent-glacier"
              />
              {t.createRoom.modeStandard}
            </label>
            {createMode === "standard" && <p className="text-xs text-amber-200">{t.createRoom.modeStandardHint}</p>}
          </fieldset>

          <fieldset className="space-y-1">
            <legend className="text-xs uppercase tracking-wide text-ice/45">{t.createRoom.visibilityLabel}</legend>
            <label className="flex items-center gap-2 text-sm text-frost/80">
              <input
                type="radio"
                name="createVisibility"
                checked={!createPublic}
                onChange={() => setCreatePublic(false)}
                className="accent-glacier"
              />
              {t.createRoom.visibilityPrivate}
            </label>
            <label className="flex items-center gap-2 text-sm text-frost/80">
              <input
                type="radio"
                name="createVisibility"
                checked={createPublic}
                onChange={() => setCreatePublic(true)}
                className="accent-glacier"
              />
              {t.createRoom.visibilityPublic}
            </label>
          </fieldset>

          <button
            type="submit"
            disabled={!hasNickname}
            className="w-full rounded-full bg-glacier-deep px-4 py-2 font-display font-bold text-frost transition-colors hover:bg-glacier disabled:cursor-not-allowed disabled:opacity-30"
          >
            {t.createRoom.submit}
          </button>
        </form>

        {/* 2. Room Terbuka (Room Browser) */}
        <section className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="font-display text-base font-bold text-frost">{t.roomBrowser.title}</h2>
              <p className="text-xs text-ice/55">{t.roomBrowser.desc}</p>
            </div>
            <button
              type="button"
              onClick={handleRefreshRooms}
              disabled={roomsLoading}
              className="shrink-0 rounded-full border border-white/15 px-3 py-1 font-display text-xs font-semibold text-ice transition-colors hover:border-white/35 hover:text-frost disabled:opacity-40"
            >
              {t.roomBrowser.refresh}
            </button>
          </div>

          {roomsError && <p className="text-xs text-red-300">{t.roomBrowser.error}</p>}
          {!roomsError && rooms === null && <p className="text-xs text-ice/45">{t.roomBrowser.loading}</p>}
          {!roomsError && rooms !== null && rooms.length === 0 && (
            <p className="text-xs text-ice/45">{t.roomBrowser.empty}</p>
          )}

          {rooms && rooms.length > 0 && (
            <ul className="space-y-1.5">
              {rooms.map((r) => (
                <li
                  key={r.code}
                  className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-night/50 px-3 py-2 text-sm"
                >
                  <div>
                    <p className="font-display font-bold text-frost">{r.hostNickname}</p>
                    <p className="text-xs text-ice/55">
                      {r.playerCount}/{r.maxPlayers} ·{" "}
                      {r.mode === "standard" ? t.roomBrowser.modeStandard : t.roomBrowser.modeCasual}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={!hasNickname}
                    onClick={() => handleJoinRoom(r.code)}
                    className="shrink-0 rounded-full bg-glacier-deep px-4 py-1.5 font-display text-xs font-bold text-frost transition-colors hover:bg-glacier disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    {t.roomBrowser.join}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Gabung via kode: baris tipis, tanpa kartu. */}
      <form onSubmit={handleJoinByCode} className="mx-auto flex max-w-md items-center gap-2">
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
          disabled={!hasNickname || !joinCode.trim()}
          className="shrink-0 rounded-full px-4 py-2 font-display text-base font-semibold text-ice transition-colors hover:text-frost disabled:cursor-not-allowed disabled:opacity-30"
        >
          {t.joinRoom}
        </button>
      </form>

      <nav aria-label={t.title}>
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

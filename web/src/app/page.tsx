"use client";

import { MAX_PLAYERS, MIN_PLAYERS } from "@thebingofi/server/engine";
import type { RoomSummary } from "@thebingofi/server/protocol";
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
    <main className="mx-auto max-w-4xl space-y-8">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-bold text-white">{t.title}</h1>
        <p className="text-slate-400">{t.tagline}</p>
      </div>

      <fieldset className="mx-auto max-w-sm space-y-1">
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
        {!hasNickname && <p className="text-xs text-amber-400">{t.nicknameRequiredHint}</p>}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* 1. Quick Match (VS Player) */}
        <section className="space-y-3 rounded border border-slate-800 bg-slate-900/60 p-4">
          <div>
            <h2 className="font-semibold text-white">{t.quickMatch.title}</h2>
            <p className="text-xs text-slate-400">{t.quickMatch.desc}</p>
          </div>
          <div className="space-y-1.5">
            <p className="text-xs uppercase tracking-wide text-slate-400">{t.quickMatch.sizeLabel}</p>
            <div className="flex flex-wrap gap-2">
              {PLAYER_COUNTS.map((size) => (
                <button
                  key={size}
                  type="button"
                  disabled={!hasNickname}
                  onClick={() => handleQuickMatch(size)}
                  className="rounded border border-indigo-600 px-3 py-1.5 text-sm font-semibold text-indigo-200 hover:bg-indigo-600/20 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {size}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* 4. VS Bot */}
        <section className="space-y-3 rounded border border-slate-800 bg-slate-900/60 p-4">
          <div>
            <h2 className="font-semibold text-white">{t.vsBot.title}</h2>
            <p className="text-xs text-slate-400">{t.vsBot.desc}</p>
          </div>
          <div className="space-y-1.5">
            <p className="text-xs uppercase tracking-wide text-slate-400">{t.vsBot.levelLabel}</p>
            <div className="grid grid-cols-5 gap-1.5">
              {BOT_LEVELS.map((level) => (
                <button
                  key={level}
                  type="button"
                  disabled={!hasNickname}
                  onClick={() => handleVsBot(level)}
                  className="rounded border border-rose-600 px-2 py-1.5 text-sm font-semibold text-rose-200 hover:bg-rose-600/20 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {level}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-500">{t.vsBot.levelHint}</p>
            <p className="text-xs text-slate-500">{t.vsBot.questHint}</p>
          </div>
        </section>

        {/* 3. Buat Room (manual create) */}
        <form
          onSubmit={handleCreateRoom}
          className="space-y-3 rounded border border-slate-800 bg-slate-900/60 p-4"
        >
          <div>
            <h2 className="font-semibold text-white">{t.createRoom.title}</h2>
            <p className="text-xs text-slate-400">{t.createRoom.desc}</p>
          </div>

          <fieldset className="space-y-1.5">
            <legend className="text-xs uppercase tracking-wide text-slate-400">
              {t.createRoom.targetPlayersLabel}
            </legend>
            <div className="flex flex-wrap gap-2">
              {PLAYER_COUNTS.map((size) => (
                <button
                  key={size}
                  type="button"
                  aria-pressed={createSize === size}
                  onClick={() => setCreateSize(size)}
                  className={`rounded border px-3 py-1.5 text-sm font-semibold transition-colors ${
                    createSize === size
                      ? "border-emerald-500 bg-emerald-600/20 text-emerald-200"
                      : "border-slate-700 text-slate-200 hover:bg-slate-800"
                  }`}
                >
                  {size}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="space-y-1">
            <legend className="text-xs uppercase tracking-wide text-slate-400">{t.createRoom.modeLabel}</legend>
            <label className="flex items-center gap-2 text-sm text-slate-200">
              <input
                type="radio"
                name="createMode"
                checked={createMode === "casual"}
                onChange={() => setCreateMode("casual")}
                className="accent-emerald-500"
              />
              {t.createRoom.modeCasual}
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-200">
              <input
                type="radio"
                name="createMode"
                checked={createMode === "standard"}
                onChange={() => setCreateMode("standard")}
                className="accent-emerald-500"
              />
              {t.createRoom.modeStandard}
            </label>
            {createMode === "standard" && <p className="text-xs text-amber-400">{t.createRoom.modeStandardHint}</p>}
          </fieldset>

          <fieldset className="space-y-1">
            <legend className="text-xs uppercase tracking-wide text-slate-400">{t.createRoom.visibilityLabel}</legend>
            <label className="flex items-center gap-2 text-sm text-slate-200">
              <input
                type="radio"
                name="createVisibility"
                checked={!createPublic}
                onChange={() => setCreatePublic(false)}
                className="accent-emerald-500"
              />
              {t.createRoom.visibilityPrivate}
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-200">
              <input
                type="radio"
                name="createVisibility"
                checked={createPublic}
                onChange={() => setCreatePublic(true)}
                className="accent-emerald-500"
              />
              {t.createRoom.visibilityPublic}
            </label>
          </fieldset>

          <button
            type="submit"
            disabled={!hasNickname}
            className="w-full rounded bg-emerald-600 px-4 py-2 font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t.createRoom.submit}
          </button>
        </form>

        {/* 2. Room Terbuka (Room Browser) */}
        <section className="space-y-3 rounded border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="font-semibold text-white">{t.roomBrowser.title}</h2>
              <p className="text-xs text-slate-400">{t.roomBrowser.desc}</p>
            </div>
            <button
              type="button"
              onClick={handleRefreshRooms}
              disabled={roomsLoading}
              className="shrink-0 rounded border border-slate-700 px-2 py-1 text-xs font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-50"
            >
              {t.roomBrowser.refresh}
            </button>
          </div>

          {roomsError && <p className="text-xs text-red-400">{t.roomBrowser.error}</p>}
          {!roomsError && rooms === null && <p className="text-xs text-slate-400">{t.roomBrowser.loading}</p>}
          {!roomsError && rooms !== null && rooms.length === 0 && (
            <p className="text-xs text-slate-400">{t.roomBrowser.empty}</p>
          )}

          {rooms && rooms.length > 0 && (
            <ul className="space-y-1.5">
              {rooms.map((r) => (
                <li
                  key={r.code}
                  className="flex items-center justify-between gap-2 rounded border border-slate-800 bg-slate-950/60 px-2.5 py-1.5 text-sm"
                >
                  <div>
                    <p className="font-semibold text-slate-100">{r.hostNickname}</p>
                    <p className="text-xs text-slate-400">
                      {r.playerCount}/{r.maxPlayers} ·{" "}
                      {r.mode === "standard" ? t.roomBrowser.modeStandard : t.roomBrowser.modeCasual}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={!hasNickname}
                    onClick={() => handleJoinRoom(r.code)}
                    className="shrink-0 rounded bg-indigo-600 px-3 py-1 text-xs font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {t.roomBrowser.join}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <form onSubmit={handleJoinByCode} className="mx-auto flex max-w-sm items-end gap-2">
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
          disabled={!hasNickname || !joinCode.trim()}
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

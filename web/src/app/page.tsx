"use client";

import { MAX_PLAYERS, MIN_PLAYERS } from "@thebingofi/server/engine";
import type { RoomSummary } from "@thebingofi/server/protocol";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import Dialog from "@/components/Dialog";
import NicknameField from "@/components/NicknameField";
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
 * Kartu mode: art bergaya "mode select" (lihat public/images/card). Judul mode
 * sudah tercetak DI dalam art, jadi label i18n di sini hanya dipakai untuk
 * alt/aria dan judul panel opsi di bawahnya - tidak dirender dua kali.
 */
const MODE_CARDS = [
  { id: "quick", image: "/images/card/vs-player.webp", labelKey: "quickMatch" },
  { id: "bot", image: "/images/card/vs-bot.webp", labelKey: "vsBot" },
  { id: "create", image: "/images/card/create-room.webp", labelKey: "createRoom" },
  { id: "open", image: "/images/card/open-room.webp", labelKey: "roomBrowser" },
] as const;

type ModeId = (typeof MODE_CARDS)[number]["id"];

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

  /** Mode yang modal opsinya sedang terbuka; null = belum ada kartu diklik.
   *  Opsi tampil sebagai modal (bukan inline di bawah) supaya deretan kartu
   *  tetap jadi fokus dan halaman tidak melompat panjang saat memilih. */
  const [openMode, setOpenMode] = useState<ModeId | null>(null);
  /** Quick Match & VS Bot sekarang dua langkah (pilih dulu, PLAY kemudian) supaya
   *  tombol aksi utamanya tunggal dan besar, bukan 10 tombol yang semuanya "start". */
  const [quickSize, setQuickSize] = useState<number>(MIN_PLAYERS);
  /** Art kartu mode yang sedang terbuka, dipakai sebagai latar modalnya. */
  const modeArt = (id: ModeId) => MODE_CARDS.find((card) => card.id === id)!.image;
  const [botLevel, setBotLevel] = useState<number>(3);

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
    <main className="mx-auto flex min-h-[calc(100vh-9rem)] max-w-5xl flex-col justify-center gap-5 py-4">

      <section className="relative">
        <div className="relative flex flex-col items-center gap-2.5 px-5 py-6 text-center">
          <h1 className="font-display text-xl font-bold leading-tight tracking-tight text-frost sm:text-2xl">
            {t.heroTitle}
          </h1>
          <p className="text-xs text-frost/60">{t.heroSubtitle}</p>

        </div>
      </section>

      {/* Pemilih mode ala layar "mode select" game: kartu art besar dipilih dulu,
          opsinya muncul di panel bawah, lalu SATU tombol aksi utama. */}
      <section
        aria-label={t.modePickerLabel}
        className="flex items-center justify-center gap-2 px-1 sm:gap-4"
      >
        {MODE_CARDS.map((card) => {
          const active = openMode === card.id;
          // Redup HANYA saat modal mode lain terbuka. Tanpa modal, keempat kartu
          // tampil penuh - sebelumnya semuanya abu-abu selama belum ada yang dipilih.
          const dimmed = openMode !== null && !active;
          const label = t[card.labelKey].title;
          return (
            <button
              key={card.id}
              type="button"
              aria-haspopup="dialog"
              aria-expanded={active}
              onClick={() => setOpenMode(card.id)}
              className={`group relative aspect-[300/520] w-[clamp(7.5rem,23vw,15rem)] shrink-0 transition-all duration-300 ${
                active
                  ? "z-10 scale-105 drop-shadow-[0_0_32px_rgba(120,190,255,0.6)]"
                  : dimmed
                    ? "scale-95 opacity-40 grayscale-[55%]"
                    : "hover:-translate-y-1.5 hover:scale-[1.04] hover:drop-shadow-[0_0_26px_rgba(120,190,255,0.45)]"
              }`}
            >
              <Image
                src={card.image}
                alt={label}
                fill
                sizes="(max-width: 640px) 30vw, 240px"
                className="object-contain"
              />
              {active && (
                <span
                  aria-hidden
                  className="absolute -top-1 right-0 grid size-5 place-items-center rounded-full bg-frost font-display text-[0.6rem] font-bold text-glacier-ink shadow-lg"
                >
                  ✓
                </span>
              )}
            </button>
          );
        })}
      </section>

      {/* Opsi tiap mode: modal (motion), muncul saat kartunya diklik. */}
      <Dialog
        open={openMode === "quick"}
        artImage={modeArt("quick")}
        title={t.quickMatch.title}
        description={t.quickMatch.desc}
        onClose={() => setOpenMode(null)}
      >
        <div className="space-y-5">
          <NicknameField id="nickname-quick" value={nickname} onChange={handleNicknameChange} />

          <fieldset>
            <legend className="mb-2 w-full text-center text-xs uppercase tracking-wide text-ice/45">
              {t.quickMatch.sizeLabel}
            </legend>
            <div className="flex justify-center gap-2">
              {PLAYER_COUNTS.map((size) => (
                <button
                  key={size}
                  type="button"
                  aria-pressed={quickSize === size}
                  onClick={() => setQuickSize(size)}
                  className={`size-11 rounded-full font-display text-base font-bold transition-all ${
                    quickSize === size
                      ? "bg-frost text-glacier-ink shadow-lg shadow-frost/20"
                      : "border border-white/15 text-ice hover:border-white/35 hover:text-frost"
                  }`}
                >
                  {size}
                </button>
              ))}
            </div>
          </fieldset>

          <button
            type="button"
            disabled={!hasNickname}
            onClick={() => handleQuickMatch(quickSize)}
            className="w-full rounded-full bg-glacier-deep py-3 font-display text-lg font-bold uppercase tracking-wide text-frost shadow-lg shadow-glacier-deep/40 transition-colors hover:bg-glacier disabled:cursor-not-allowed disabled:opacity-30"
          >
            {t.playNow}
          </button>
        </div>
      </Dialog>

      <Dialog
        open={openMode === "bot"}
        artImage={modeArt("bot")}
        title={t.vsBot.title}
        description={t.vsBot.desc}
        onClose={() => setOpenMode(null)}
      >
        <div className="space-y-5">
          <NicknameField id="nickname-bot" value={nickname} onChange={handleNicknameChange} />

          <fieldset className="space-y-2">
            <legend className="mb-2 w-full text-center text-xs uppercase tracking-wide text-ice/45">
              {t.vsBot.levelLabel}
            </legend>
            {/* Tangga kesulitan: makin tinggi level makin "panas" latarnya. */}
            <div className="grid grid-cols-5 gap-1.5">
              {BOT_LEVELS.map((level) => (
                <button
                  key={level}
                  type="button"
                  aria-pressed={botLevel === level}
                  onClick={() => setBotLevel(level)}
                  className={`relative rounded-xl py-2.5 font-display text-sm font-bold transition-all ${
                    botLevel === level
                      ? "-translate-y-0.5 bg-frost text-glacier-ink shadow-lg shadow-frost/20"
                      : "border border-white/15 text-ice hover:border-white/35 hover:text-frost"
                  }`}
                  style={
                    botLevel === level
                      ? undefined
                      : { backgroundColor: `rgba(${120 + level * 10}, ${90 - level * 6}, ${60 - level * 4}, ${0.05 + level * 0.03})` }
                  }
                >
                  {level}
                  {[1, 3, 5, 7, 10].includes(level) && (
                    <span aria-hidden className="absolute right-1 top-0.5 text-[0.6rem] text-amber-300">
                      ★
                    </span>
                  )}
                </button>
              ))}
            </div>
            <p className="text-center text-xs text-ice/45">{t.vsBot.levelHint}</p>
            <p className="text-center text-xs text-ice/45">★ {t.vsBot.questHint}</p>
          </fieldset>

          <button
            type="button"
            disabled={!hasNickname}
            onClick={() => handleVsBot(botLevel)}
            className="w-full rounded-full bg-glacier-deep py-3 font-display text-lg font-bold uppercase tracking-wide text-frost shadow-lg shadow-glacier-deep/40 transition-colors hover:bg-glacier disabled:cursor-not-allowed disabled:opacity-30"
          >
            {t.playNow}
          </button>
        </div>
      </Dialog>

      <Dialog
        open={openMode === "create"}
        artImage={modeArt("create")}
        title={t.createRoom.title}
        description={t.createRoom.desc}
        onClose={() => setOpenMode(null)}
      >
        <form onSubmit={handleCreateRoom} className="space-y-5">
          <NicknameField id="nickname-create" value={nickname} onChange={handleNicknameChange} />

          <fieldset>
            <legend className="mb-2 w-full text-center text-xs uppercase tracking-wide text-ice/45">
              {t.createRoom.targetPlayersLabel}
            </legend>
            <div className="flex justify-center gap-2">
              {PLAYER_COUNTS.map((size) => (
                <button
                  key={size}
                  type="button"
                  aria-pressed={createSize === size}
                  onClick={() => setCreateSize(size)}
                  className={`size-11 rounded-full font-display text-base font-bold transition-all ${
                    createSize === size
                      ? "bg-frost text-glacier-ink shadow-lg shadow-frost/20"
                      : "border border-white/15 text-ice hover:border-white/35 hover:text-frost"
                  }`}
                >
                  {size}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
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
          </div>

          <button
            type="submit"
            disabled={!hasNickname}
            className="w-full rounded-full bg-glacier-deep py-3 font-display text-lg font-bold uppercase tracking-wide text-frost shadow-lg shadow-glacier-deep/40 transition-colors hover:bg-glacier disabled:cursor-not-allowed disabled:opacity-30"
          >
            {t.createRoom.submit}
          </button>
        </form>
      </Dialog>

      <Dialog
        open={openMode === "open"}
        artImage={modeArt("open")}
        title={t.roomBrowser.title}
        description={t.roomBrowser.desc}
        onClose={() => setOpenMode(null)}
      >
        <div className="space-y-3">
          <NicknameField id="nickname-open" value={nickname} onChange={handleNicknameChange} />

          <div className="flex justify-center">
            <button
              type="button"
              onClick={handleRefreshRooms}
              disabled={roomsLoading}
              className="rounded-full border border-white/15 px-4 py-1 font-display text-xs font-semibold text-ice transition-colors hover:border-white/35 hover:text-frost disabled:opacity-40"
            >
              {t.roomBrowser.refresh}
            </button>
          </div>

          {roomsError && <p className="text-center text-xs text-red-300">{t.roomBrowser.error}</p>}
          {!roomsError && rooms === null && <p className="text-center text-xs text-ice/45">{t.roomBrowser.loading}</p>}
          {!roomsError && rooms !== null && rooms.length === 0 && (
            <p className="text-center text-xs text-ice/45">{t.roomBrowser.empty}</p>
          )}

          {rooms && rooms.length > 0 && (
            <ul className="max-h-72 space-y-1.5 overflow-y-auto">
              {rooms.map((r) => (
                <li
                  key={r.code}
                  className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-night/60 px-3 py-2 text-sm"
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
        </div>
      </Dialog>

      {/* Gabung via kode: baris tipis, tanpa kartu. Nickname TIDAK diminta di
          sini - satu-satunya tempat mengisinya adalah modal mode. */}
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
          className="min-w-0 flex-1 rounded-full border border-white/15 bg-night/50 px-4 py-2 font-mono backdrop-blur-md text-sm uppercase tracking-widest text-frost placeholder:tracking-normal placeholder:text-ice/30 focus:border-white/30 focus:outline-none"
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

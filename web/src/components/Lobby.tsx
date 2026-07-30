"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import type { LobbyPlayerView, LobbyView } from "@thebingofi/server/protocol";

import { useLocale } from "@/hooks/useLocale";
import { strings } from "@/i18n/strings";
import { truncateAddress } from "@/lib/chain";
import PlayerList from "@/components/PlayerList";

export interface LobbyProps {
  readonly code: string;
  readonly players: readonly LobbyPlayerView[];
  readonly hostId: string;
  readonly mode: LobbyView["mode"];
  /** Room capacity, 2-5 - paired with players.length to render "X/Y pemain". */
  readonly maxPlayers: number;
  /** "public" rooms are discoverable via room:list/room:quick, "private" are code-only. */
  readonly visibility: LobbyView["visibility"];
  /** True when this room was entered via Quick Match (client-side only, see hooks/useRoom.ts's RoomEntryKind) - hides the host "start draft" button in favor of an "auto-starts when full" note, since Quick Match rooms auto-advance to draft server-side with no draft:start call at all. */
  readonly isQuickMatch: boolean;
  readonly playerId: string;
  readonly isHost: boolean;
  readonly canStart: boolean;
  readonly pending: boolean;
  readonly onStartDraft: () => void;
  readonly onLeave: () => void;
  /** Connected wallet address (see hooks/useWallet.ts), if any - independent of whether it's linked to THIS room yet. */
  readonly connectedWalletAddress?: string;
  readonly walletLinkPending?: boolean;
  readonly onLinkWallet?: () => void;
  /** Rendered loadout picker subtree (see components/LoadoutPicker.tsx) - /play's page.tsx owns the on-chain catalog/ownership fetching, Lobby just slots it in once wallet-linked. */
  readonly loadoutPicker?: ReactNode;
}

/** Dumb: pre-match lobby - room code to share (with copy), slot count + visibility badge, player list + loadouts ("standard" mode only), wallet-link CTA, host-only "start draft" action (or an auto-start note for Quick Match rooms), leave action. */
export default function Lobby({
  code,
  players,
  hostId,
  mode,
  maxPlayers,
  visibility,
  isQuickMatch,
  playerId,
  isHost,
  canStart,
  pending,
  onStartDraft,
  onLeave,
  connectedWalletAddress,
  walletLinkPending,
  onLinkWallet,
  loadoutPicker,
}: LobbyProps) {
  const locale = useLocale();
  const t = strings[locale].play;
  const me = players.find((player) => player.playerId === playerId);
  const [copied, setCopied] = useState(false);

  function handleCopyCode() {
    navigator.clipboard
      .writeText(code)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => undefined);
  }

  return (
    <section className="space-y-4 rounded-3xl border border-white/10 bg-night/55 p-4 backdrop-blur-md sm:p-6">
      <h2 className="text-center font-display text-xl font-bold text-frost">{t.lobby.title}</h2>

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-night/50 p-3">
        <dl className="flex items-baseline gap-2">
          <dt className="text-xs uppercase tracking-wide text-ice/45">{t.roomCodeLabel}</dt>
          <dd className="font-mono text-2xl font-bold tracking-[0.3em] text-frost">{code}</dd>
        </dl>
        <button
          type="button"
          onClick={handleCopyCode}
          className="rounded-full border border-white/15 px-3 py-1 font-display text-xs font-semibold text-ice transition-colors hover:border-white/35 hover:text-frost"
        >
          {copied ? t.lobby.roomCodeCopied : t.lobby.roomCodeCopy}
        </button>
        <span className="ml-auto rounded-full border border-white/15 px-3 py-1 font-display text-xs font-bold text-frost">
          {players.length}/{maxPlayers} {t.lobby.playersSuffix}
        </span>
        <span
          className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
            visibility === "public"
              ? "border-glacier/60 bg-glacier/15 text-frost"
              : "border-white/15 text-ice/60"
          }`}
        >
          {visibility === "public" ? t.lobby.visibilityPublic : t.lobby.visibilityPrivate}
        </span>
      </div>

      <PlayerList players={players} hostId={hostId} mode={mode} />

      {mode === "standard" && (
        <section className="space-y-3 rounded-2xl border border-white/10 bg-night/40 p-3">
          <h3 className="font-display text-sm font-bold text-frost">{t.lobby.loadoutTitle}</h3>
          <p className="text-sm text-ice/70">
            {t.lobby.walletLabel}: <span className="font-mono">{me?.wallet ?? t.lobby.walletNotLinked}</span>
          </p>

          {!me?.wallet && (
            <div className="space-y-1">
              {connectedWalletAddress ? (
                <button
                  type="button"
                  onClick={onLinkWallet}
                  disabled={walletLinkPending}
                  className="rounded-full bg-glacier-deep px-5 py-2 font-display text-sm font-bold text-frost transition-colors hover:bg-glacier disabled:cursor-not-allowed disabled:opacity-30"
                >
                  {walletLinkPending
                    ? t.lobby.linkWalletPending
                    : `${t.lobby.linkWallet} (${truncateAddress(connectedWalletAddress)})`}
                </button>
              ) : (
                <p className="text-xs text-amber-200">{t.lobby.connectFirst}</p>
              )}
            </div>
          )}

          {me?.wallet && (
            <>
              <p className="text-xs text-frost/70">✓ {t.lobby.walletLinked}</p>
              {loadoutPicker}
            </>
          )}

          <p className="text-xs text-ice/50">{t.lobby.loadoutNote}</p>

          <div>
            <h4 className="text-xs uppercase tracking-wide text-ice/45">{t.lobby.loadoutPlayersTitle}</h4>
            <ul className="mt-1 space-y-1 text-xs text-ice/70">
              {players.map((player) => (
                <li key={player.playerId}>
                  {player.wallet ? (
                    <Link href={`/profile/${player.wallet}`} className="hover:underline">
                      {player.nickname}
                    </Link>
                  ) : (
                    player.nickname
                  )}
                  :{" "}
                  {player.loadout && player.loadout.length > 0 ? player.loadout.join(", ") : t.lobby.loadoutNone}
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {isQuickMatch ? (
        <p className="rounded-2xl border border-glacier/40 bg-glacier/15 px-4 py-2.5 text-center text-sm text-frost/85">
          {t.lobby.waitingForPlayers} {players.length}/{maxPlayers} · {t.lobby.autoStartNote}
        </p>
      ) : (
        isHost && (
          <div className="space-y-1">
            <button
              type="button"
              onClick={onStartDraft}
              disabled={pending || !canStart}
              className="w-full rounded-full bg-glacier-deep px-8 py-2.5 font-display text-base font-bold text-frost shadow-lg shadow-glacier-deep/40 transition-colors hover:bg-glacier disabled:cursor-not-allowed disabled:opacity-30"
            >
              {t.lobby.startDraft}
            </button>
            {!canStart && <p className="text-center text-xs text-amber-200">{t.lobby.needMorePlayers}</p>}
          </div>
        )
      )}

      <button
        type="button"
        onClick={onLeave}
        className="mx-auto block rounded-full border border-white/15 px-5 py-1.5 font-display text-sm font-semibold text-ice/70 transition-colors hover:border-white/35 hover:text-frost"
      >
        {t.leaveRoom}
      </button>
    </section>
  );
}

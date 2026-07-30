"use client";

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

/** Dumb: pre-match lobby - room code to share (with copy), player list + loadouts ("standard" mode only), wallet-link CTA, host-only "start draft" action, leave action. */
export default function Lobby({
  code,
  players,
  hostId,
  mode,
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
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">{t.lobby.title}</h2>

      <div className="flex flex-wrap items-center gap-3 rounded border border-slate-800 bg-slate-900/60 p-3">
        <dl className="flex items-baseline gap-2">
          <dt className="text-xs uppercase text-slate-400">{t.roomCodeLabel}</dt>
          <dd className="font-mono text-xl font-bold tracking-widest text-white">{code}</dd>
        </dl>
        <button
          type="button"
          onClick={handleCopyCode}
          className="rounded border border-slate-700 px-2 py-1 text-xs font-semibold text-slate-200 hover:bg-slate-800"
        >
          {copied ? t.lobby.roomCodeCopied : t.lobby.roomCodeCopy}
        </button>
      </div>

      <PlayerList players={players} hostId={hostId} mode={mode} />

      {mode === "standard" && (
        <section className="space-y-3 rounded border border-slate-800 p-3">
          <h3 className="text-sm font-semibold text-slate-200">{t.lobby.loadoutTitle}</h3>
          <p className="text-sm text-slate-300">
            {t.lobby.walletLabel}: <span className="font-mono">{me?.wallet ?? t.lobby.walletNotLinked}</span>
          </p>

          {!me?.wallet && (
            <div className="space-y-1">
              {connectedWalletAddress ? (
                <button
                  type="button"
                  onClick={onLinkWallet}
                  disabled={walletLinkPending}
                  className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {walletLinkPending
                    ? t.lobby.linkWalletPending
                    : `${t.lobby.linkWallet} (${truncateAddress(connectedWalletAddress)})`}
                </button>
              ) : (
                <p className="text-xs text-amber-400">{t.lobby.connectFirst}</p>
              )}
            </div>
          )}

          {me?.wallet && (
            <>
              <p className="text-xs text-emerald-400">{t.lobby.walletLinked}</p>
              {loadoutPicker}
            </>
          )}

          <p className="text-xs text-slate-400">{t.lobby.loadoutNote}</p>

          <div>
            <h4 className="text-xs font-semibold uppercase text-slate-400">{t.lobby.loadoutPlayersTitle}</h4>
            <ul className="mt-1 space-y-1 text-xs text-slate-300">
              {players.map((player) => (
                <li key={player.playerId}>
                  {player.nickname}:{" "}
                  {player.loadout && player.loadout.length > 0 ? player.loadout.join(", ") : t.lobby.loadoutNone}
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {isHost && (
        <div className="space-y-1">
          <button
            type="button"
            onClick={onStartDraft}
            disabled={pending || !canStart}
            className="rounded bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t.lobby.startDraft}
          </button>
          {!canStart && <p className="text-xs text-amber-400">{t.lobby.needMorePlayers}</p>}
        </div>
      )}

      <button
        type="button"
        onClick={onLeave}
        className="rounded border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
      >
        {t.leaveRoom}
      </button>
    </section>
  );
}

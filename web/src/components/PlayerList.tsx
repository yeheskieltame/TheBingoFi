import Link from "next/link";
import type { LobbyPlayerView, LobbyView } from "@thebingofi/server/protocol";

import { useLocale } from "@/hooks/useLocale";
import { strings } from "@/i18n/strings";

export interface PlayerListProps {
  readonly players: readonly LobbyPlayerView[];
  readonly hostId: string;
  /** When "standard", adds wallet/loadout columns (players[].wallet/loadout are public, see server/API.md). Omit/casual hides them. */
  readonly mode?: LobbyView["mode"];
}

/**
 * Dumb table of room players: nickname, host flag, connection, board-submit
 * status (+ wallet/loadout in "standard" mode). Used by Lobby and /play's
 * draft phase. Nickname links to `/profile/<wallet>` when the player has one
 * linked (`wallet` is public per server/API.md, regardless of room mode) -
 * plain text otherwise, since there's no address to link to.
 */
export default function PlayerList({ players, hostId, mode }: PlayerListProps) {
  const locale = useLocale();
  const t = strings[locale].play.lobby;
  const showLoadout = mode === "standard";

  return (
    // Sampai 5 kolom: di HP tabelnya lebih lebar dari layar, jadi dibiarkan
    // digeser mendatar alih-alih memaksa teksnya menumpuk jadi satu huruf.
    <div className="-mx-1 overflow-x-auto px-1">
      <table className="w-full min-w-[20rem] border-collapse text-left text-xs sm:text-sm">
        <caption className="mb-2 text-left text-xs uppercase tracking-wide text-ice/45">{t.playersTitle}</caption>
        <thead>
          <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-ice/40">
            <th scope="col" className="py-1 pr-2">
              {strings[locale].landing.nicknameLabel}
            </th>
            <th scope="col" className="py-1 pr-2">
              {t.host}
            </th>
            <th scope="col" className="py-1 pr-2">
              {t.connected}
            </th>
            <th scope="col" className="py-1 pr-2">
              {t.submitted}
            </th>
            {showLoadout && (
              <th scope="col" className="py-1 pr-2">
                {t.loadoutLabel}
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {players.map((player) => (
            <tr key={player.playerId} className="border-b border-white/5">
              <td className="py-2 pr-2 font-display font-bold text-frost">
                {player.wallet ? (
                  <Link href={`/profile/${player.wallet}`} className="hover:underline">
                    {player.nickname}
                  </Link>
                ) : (
                  player.nickname
                )}
                {player.isBot && (
                  <span className="ml-1.5 rounded-full border border-amber-300/60 px-2 py-0.5 align-middle text-[10px] font-bold uppercase text-amber-200">
                    {t.botBadge}
                  </span>
                )}
              </td>
              <td className="py-2 pr-2 text-ice/50">{player.playerId === hostId ? t.host : ""}</td>
              <td className="py-2 pr-2">
                <span className={player.connected ? "text-frost/75" : "text-red-300"}>
                  {player.connected ? t.connected : t.disconnected}
                </span>
              </td>
              <td className="py-2 pr-2 text-ice/70">{player.hasSubmittedBoard ? t.submitted : t.waiting}</td>
              {showLoadout && (
                <td className="py-2 pr-2 text-ice/70">
                  {player.loadout && player.loadout.length > 0 ? player.loadout.join(", ") : t.loadoutNone}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

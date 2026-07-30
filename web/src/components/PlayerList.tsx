import type { LobbyPlayerView, LobbyView } from "@thebingofi/server/protocol";

import { useLocale } from "@/hooks/useLocale";
import { strings } from "@/i18n/strings";

export interface PlayerListProps {
  readonly players: readonly LobbyPlayerView[];
  readonly hostId: string;
  /** When "standard", adds wallet/loadout columns (players[].wallet/loadout are public, see server/API.md). Omit/casual hides them. */
  readonly mode?: LobbyView["mode"];
}

/** Dumb table of room players: nickname, host flag, connection, board-submit status (+ wallet/loadout in "standard" mode). Used by Lobby and /play's draft phase. */
export default function PlayerList({ players, hostId, mode }: PlayerListProps) {
  const locale = useLocale();
  const t = strings[locale].play.lobby;
  const showLoadout = mode === "standard";

  return (
    <table className="w-full border-collapse text-left text-sm">
      <caption className="mb-1 text-left text-xs uppercase text-slate-400">{t.playersTitle}</caption>
      <thead>
        <tr className="border-b border-slate-800 text-xs uppercase text-slate-400">
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
          <tr key={player.playerId} className="border-b border-slate-900">
            <td className="py-1 pr-2 font-medium text-slate-100">{player.nickname}</td>
            <td className="py-1 pr-2 text-slate-400">{player.playerId === hostId ? t.host : ""}</td>
            <td className="py-1 pr-2">
              <span className={player.connected ? "text-emerald-400" : "text-red-400"}>
                {player.connected ? t.connected : t.disconnected}
              </span>
            </td>
            <td className="py-1 pr-2 text-slate-300">{player.hasSubmittedBoard ? t.submitted : t.waiting}</td>
            {showLoadout && (
              <td className="py-1 pr-2 text-slate-300">
                {player.loadout && player.loadout.length > 0 ? player.loadout.join(", ") : t.loadoutNone}
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

import type { LobbyPlayerView } from "@thebingofi/server/protocol";

import { strings } from "@/i18n/strings";

const locale = "id";

export interface PlayerListProps {
  readonly players: readonly LobbyPlayerView[];
  readonly hostId: string;
}

/** Dumb table of room players: nickname, host flag, connection, board-submit status. Used by Lobby and /play's draft phase. */
export default function PlayerList({ players, hostId }: PlayerListProps) {
  const t = strings[locale].play.lobby;

  return (
    <table>
      <caption>{t.playersTitle}</caption>
      <thead>
        <tr>
          <th scope="col">{strings[locale].landing.nicknameLabel}</th>
          <th scope="col">{t.host}</th>
          <th scope="col">{t.connected}</th>
          <th scope="col">{t.submitted}</th>
        </tr>
      </thead>
      <tbody>
        {players.map((player) => (
          <tr key={player.playerId}>
            <td>{player.nickname}</td>
            <td>{player.playerId === hostId ? t.host : ""}</td>
            <td>{player.connected ? t.connected : t.disconnected}</td>
            <td>{player.hasSubmittedBoard ? t.submitted : t.waiting}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

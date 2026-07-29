import type { LobbyPlayerView, LobbyView } from "@thebingofi/server/protocol";

import { strings } from "@/i18n/strings";
import PlayerList from "@/components/PlayerList";

const locale = "id";

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
}

/** Dumb: pre-match lobby - room code to share, player list, own loadout ("standard" mode only, see server/API.md's "Mode room & Loadout"), host-only "start draft" action, leave action. */
export default function Lobby({ code, players, hostId, mode, playerId, isHost, canStart, pending, onStartDraft, onLeave }: LobbyProps) {
  const t = strings[locale].play;
  const me = players.find((player) => player.playerId === playerId);

  return (
    <section>
      <h2>{t.lobby.title}</h2>

      <dl>
        <dt>{t.roomCodeLabel}</dt>
        <dd>{code}</dd>
      </dl>

      <PlayerList players={players} hostId={hostId} />

      {mode === "standard" && (
        <section>
          <h3>{t.lobby.loadoutTitle}</h3>
          <p>
            {t.lobby.walletLabel}: {me?.wallet ?? t.lobby.walletNotLinked}
          </p>
          <p>
            {t.lobby.loadoutLabel}: {me?.loadout && me.loadout.length > 0 ? me.loadout.join(", ") : t.lobby.loadoutEmpty}
          </p>
          <p>{t.lobby.loadoutNote}</p>
        </section>
      )}

      {isHost && (
        <div>
          <button type="button" onClick={onStartDraft} disabled={pending || !canStart}>
            {t.lobby.startDraft}
          </button>
          {!canStart && <p>{t.lobby.needMorePlayers}</p>}
        </div>
      )}

      <button type="button" onClick={onLeave}>
        {t.leaveRoom}
      </button>
    </section>
  );
}

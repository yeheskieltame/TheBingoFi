import type { LobbyPlayerView } from "@thebingofi/server/protocol";

import { strings } from "@/i18n/strings";
import PlayerList from "@/components/PlayerList";

const locale = "id";

export interface LobbyProps {
  readonly code: string;
  readonly players: readonly LobbyPlayerView[];
  readonly hostId: string;
  readonly isHost: boolean;
  readonly canStart: boolean;
  readonly pending: boolean;
  readonly onStartDraft: () => void;
  readonly onLeave: () => void;
}

/** Dumb: pre-match lobby - room code to share, player list, host-only "start draft" action, leave action. */
export default function Lobby({ code, players, hostId, isHost, canStart, pending, onStartDraft, onLeave }: LobbyProps) {
  const t = strings[locale].play;

  return (
    <section>
      <h2>{t.lobby.title}</h2>

      <dl>
        <dt>{t.roomCodeLabel}</dt>
        <dd>{code}</dd>
      </dl>

      <PlayerList players={players} hostId={hostId} />

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

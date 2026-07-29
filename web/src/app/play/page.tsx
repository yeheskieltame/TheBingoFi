"use client";

import { MIN_PLAYERS } from "@thebingofi/server/engine";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef } from "react";

import DraftBoard from "@/components/DraftBoard";
import Lobby from "@/components/Lobby";
import MatchBoard from "@/components/MatchBoard";
import MatchResult from "@/components/MatchResult";
import PlayerList from "@/components/PlayerList";
import QuestNotifications from "@/components/QuestNotifications";
import { useDraftBoard } from "@/hooks/useDraftBoard";
import { useRoom } from "@/hooks/useRoom";
import { strings } from "@/i18n/strings";
import { getStoredNickname } from "@/lib/storage";

const locale = "id";

/**
 * The actual /play screen. Split out from the default export purely so
 * useSearchParams (reading ?code=) has a Suspense boundary above it, per
 * Next's requirement for statically-analyzed pages - see PlayPage below.
 */
function PlayScreen() {
  const t = strings[locale].play;
  const router = useRouter();
  const searchParams = useSearchParams();
  const code = searchParams.get("code");

  const room = useRoom();
  const draft = useDraftBoard();
  const attemptedJoin = useRef(false);

  useEffect(() => {
    if (attemptedJoin.current) return;
    attemptedJoin.current = true;

    const nickname = getStoredNickname();
    if (!nickname) {
      router.replace("/");
      return;
    }

    if (code) {
      room.joinRoom(code, nickname);
    } else {
      room.createRoom(nickname);
    }
    // Run once on mount only - re-running on every render would re-create/re-join.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleLeave() {
    room.leaveRoom();
    router.push("/");
  }

  const me = room.state.lobby?.players.find((player) => player.playerId === room.state.playerId);
  const isHost = room.state.lobby?.hostId === room.state.playerId;

  return (
    <main>
      <h1>{t.title}</h1>

      {room.state.error && (
        <p role="alert">
          {room.state.error} <button onClick={room.clearError}>OK</button>
        </p>
      )}

      <QuestNotifications notifications={room.state.questNotifications} />

      {room.phase === null && <p>{t.connecting}</p>}

      {room.phase === "lobby" && room.state.lobby && (
        <Lobby
          code={room.state.code ?? ""}
          players={room.state.lobby.players}
          hostId={room.state.lobby.hostId}
          isHost={isHost}
          canStart={room.state.lobby.players.length >= MIN_PLAYERS}
          pending={room.state.pending}
          onStartDraft={room.startDraft}
          onLeave={handleLeave}
        />
      )}

      {room.phase === "draft" && room.state.lobby && (
        <section>
          {me?.hasSubmittedBoard ? (
            <p>{t.draft.locked}</p>
          ) : (
            <>
              <DraftBoard
                numbers={draft.numbers}
                selectedIndex={draft.selectedIndex}
                onSelectCell={draft.selectCell}
                onShuffle={draft.shuffle}
                valid={draft.validation.valid}
                validationError={draft.validation.error}
              />
              <button
                type="button"
                onClick={() => room.submitDraft(draft.numbers)}
                disabled={room.state.pending || !draft.validation.valid}
              >
                {t.draft.lockBoard}
              </button>
            </>
          )}
          <PlayerList players={room.state.lobby.players} hostId={room.state.lobby.hostId} />
        </section>
      )}

      {room.phase === "playing" && room.state.match && (
        <MatchBoard view={room.state.match} playerId={room.state.playerId ?? ""} onCall={room.callNumber} pending={room.state.pending} />
      )}

      {room.phase === "finished" && (
        <MatchResult
          winnerId={room.state.matchEnded?.winnerId ?? room.state.match?.winnerId ?? null}
          reason={room.state.matchEnded?.reason}
          players={room.state.match?.players ?? room.state.lobby?.players ?? []}
          onBackToLanding={() => router.push("/")}
        />
      )}
    </main>
  );
}

export default function PlayPage() {
  return (
    <Suspense
      fallback={
        <main>
          <p>{strings[locale].common.loading}</p>
        </main>
      }
    >
      <PlayScreen />
    </Suspense>
  );
}

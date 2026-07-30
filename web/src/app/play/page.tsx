"use client";

import { CELL_SWAP, MIN_PLAYERS, WILD_DAUB } from "@thebingofi/server/engine";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

import DraftBoard from "@/components/DraftBoard";
import Lobby from "@/components/Lobby";
import LoadoutPicker from "@/components/LoadoutPicker";
import MatchBoard from "@/components/MatchBoard";
import MatchResult from "@/components/MatchResult";
import PlayerList from "@/components/PlayerList";
import QuestNotifications from "@/components/QuestNotifications";
import SkillPanel from "@/components/SkillPanel";
import { useDraftBoard } from "@/hooks/useDraftBoard";
import { useLocale } from "@/hooks/useLocale";
import { useRoom } from "@/hooks/useRoom";
import { useSkillCatalog } from "@/hooks/useSkillCatalog";
import { useSkillOwnership } from "@/hooks/useSkillOwnership";
import { useWallet } from "@/hooks/useWallet";
import { strings } from "@/i18n/strings";
import { getStoredNickname } from "@/lib/storage";

const MAX_LOADOUT_SIZE = 2;

/**
 * The actual /play screen. Split out from the default export purely so
 * useSearchParams (reading ?code=/?mode=) has a Suspense boundary above it,
 * per Next's requirement for statically-analyzed pages - see PlayPage below.
 */
function PlayScreen() {
  const locale = useLocale();
  const t = strings[locale].play;
  const router = useRouter();
  const searchParams = useSearchParams();
  const code = searchParams.get("code");
  const requestedMode = searchParams.get("mode") === "standard" ? "standard" : "casual";

  const room = useRoom();
  const draft = useDraftBoard();
  const wallet = useWallet();
  const attemptedJoin = useRef(false);

  // Once room:state arrives the server is authoritative on `mode` (joining
  // via code, the room may already be "standard" regardless of the ?mode=
  // this tab was opened with) - the query param only decides what a fresh
  // room:create asks for.
  const mode = room.state.lobby?.mode ?? requestedMode;
  const isStandard = mode === "standard";

  const catalog = useSkillCatalog(isStandard);
  const catalogSkillIds = catalog.catalog?.map((entry) => entry.skillId) ?? [];
  const ownership = useSkillOwnership(isStandard ? wallet.address : undefined, catalogSkillIds);
  const ownedSkillIds = new Set(
    Array.from(ownership.balances.entries())
      .filter(([, balance]) => balance > 0n)
      .map(([skillId]) => skillId),
  );

  const [selectedSkillIds, setSelectedSkillIds] = useState<number[]>([]);

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
      room.createRoom(nickname, requestedMode === "standard" ? "standard" : undefined);
    }
    // Run once on mount only - re-running on every render would re-create/re-join.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleLeave() {
    room.leaveRoom();
    router.push("/");
  }

  /** Rematch: leave the finished room and immediately create a fresh one of the same mode, staying on /play. Both emits share one ordered socket connection, so the server always sees room:leave before room:create. */
  function handlePlayAgain() {
    const nickname = getStoredNickname();
    if (!nickname) {
      router.push("/");
      return;
    }
    room.leaveRoom();
    room.createRoom(nickname, mode === "standard" ? "standard" : undefined);
  }

  /** Skill button clicked in SkillPanel: WILD_DAUB/CELL_SWAP need extra board clicks first (see MatchBoard's skillSelection), DOUBLE_CALL/GHOST_CALL cast immediately with no args. */
  function handleActivateSkill(effectType: string) {
    if (effectType === WILD_DAUB) {
      room.armSkillSelection(effectType, 1);
    } else if (effectType === CELL_SWAP) {
      room.armSkillSelection(effectType, 2);
    } else {
      room.castSkill(effectType);
    }
  }

  function toggleLoadoutSkill(skillId: number) {
    setSelectedSkillIds((prev) => {
      if (prev.includes(skillId)) return prev.filter((id) => id !== skillId);
      if (prev.length >= MAX_LOADOUT_SIZE) return prev;
      return [...prev, skillId];
    });
  }

  function handleSaveLoadout() {
    room.setLoadout(selectedSkillIds);
  }

  function handleLinkWallet() {
    if (!wallet.address) return;
    room.linkWallet(wallet.address, wallet.signMessage);
  }

  const me = room.state.lobby?.players.find((player) => player.playerId === room.state.playerId);
  const isHost = room.state.lobby?.hostId === room.state.playerId;

  return (
    <main className="space-y-6">
      <h1 className="text-2xl font-bold">{t.title}</h1>

      {room.state.error && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded border border-red-600 bg-red-950/60 px-3 py-2 text-sm text-red-300"
        >
          <span>{room.state.error}</span>
          <button
            type="button"
            onClick={room.clearError}
            className="shrink-0 rounded border border-red-500 px-2 py-0.5 text-xs font-semibold hover:bg-red-900"
          >
            {strings[locale].common.dismiss}
          </button>
        </div>
      )}

      <QuestNotifications notifications={room.state.questNotifications} />

      {room.phase === null && <p className="text-slate-400">{t.connecting}</p>}

      {room.phase === "lobby" && room.state.lobby && (
        <Lobby
          code={room.state.code ?? ""}
          players={room.state.lobby.players}
          hostId={room.state.lobby.hostId}
          mode={room.state.lobby.mode}
          playerId={room.state.playerId ?? ""}
          isHost={isHost}
          canStart={room.state.lobby.players.length >= MIN_PLAYERS}
          pending={room.state.pending}
          onStartDraft={room.startDraft}
          onLeave={handleLeave}
          connectedWalletAddress={wallet.address}
          walletLinkPending={room.state.pending}
          onLinkWallet={handleLinkWallet}
          loadoutPicker={
            <LoadoutPicker
              catalog={catalog.catalog ?? []}
              ownedSkillIds={ownedSkillIds}
              selected={selectedSkillIds}
              savedLoadout={me?.loadout}
              catalogLoading={catalog.loading}
              catalogError={catalog.error}
              saving={room.state.pending}
              onToggle={toggleLoadoutSkill}
              onSave={handleSaveLoadout}
            />
          }
        />
      )}

      {room.phase === "draft" && room.state.lobby && (
        <section className="space-y-4">
          {me?.hasSubmittedBoard ? (
            <p className="text-slate-300">{t.draft.locked}</p>
          ) : (
            <>
              <DraftBoard
                numbers={draft.numbers}
                selectedIndex={draft.selectedIndex}
                onSelectCell={draft.selectCell}
                onSwapCells={draft.swapCells}
                onShuffle={draft.shuffle}
                valid={draft.validation.valid}
                validationError={draft.validation.error}
              />
              <button
                type="button"
                onClick={() => room.submitDraft(draft.numbers)}
                disabled={room.state.pending || !draft.validation.valid}
                className="rounded bg-emerald-600 px-4 py-2 font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t.draft.lockBoard}
              </button>
            </>
          )}
          <PlayerList players={room.state.lobby.players} hostId={room.state.lobby.hostId} mode={room.state.lobby.mode} />
        </section>
      )}

      {room.phase === "playing" && room.state.match && (
        <div className="space-y-6">
          <MatchBoard
            view={room.state.match}
            playerId={room.state.playerId ?? ""}
            onCall={room.callNumber}
            pending={room.state.pending}
            skillSelection={room.state.skillSelection}
            onSelectSkillCell={room.selectSkillCell}
          />
          <SkillPanel
            view={room.state.match}
            viewerPlayerId={room.state.playerId ?? ""}
            pending={room.state.pending}
            selection={room.state.skillSelection}
            resolutions={room.state.skillResolutions}
            onActivateSkill={handleActivateSkill}
            onCancelSelection={room.cancelSkillSelection}
            onNullify={() => room.respondSkill(true)}
            onPass={() => room.respondSkill(false)}
          />
        </div>
      )}

      {room.phase === "finished" && (
        <MatchResult
          winnerId={room.state.matchEnded?.winnerId ?? room.state.match?.winnerId ?? null}
          reason={room.state.matchEnded?.reason}
          players={room.state.match?.players ?? room.state.lobby?.players ?? []}
          onBackToLanding={() => router.push("/")}
          onPlayAgain={handlePlayAgain}
        />
      )}
    </main>
  );
}

export default function PlayPage() {
  const locale = useLocale();

  return (
    <Suspense
      fallback={
        <main>
          <p className="text-slate-400">{strings[locale].common.loading}</p>
        </main>
      }
    >
      <PlayScreen />
    </Suspense>
  );
}

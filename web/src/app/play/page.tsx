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
import { useBoardSkins } from "@/hooks/useBoardSkins";
import { useDraftBoard } from "@/hooks/useDraftBoard";
import { useLocale } from "@/hooks/useLocale";
import { usePlazaShare } from "@/hooks/usePlazaShare";
import { useRoom } from "@/hooks/useRoom";
import { useSkillCatalog } from "@/hooks/useSkillCatalog";
import { useSkillOwnership } from "@/hooks/useSkillOwnership";
import { useWallet } from "@/hooks/useWallet";
import { strings } from "@/i18n/strings";
import { boardAttachmentFrom } from "@/lib/matchShare";
import { getStoredNickname, setStoredLastBoard } from "@/lib/storage";

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
  const boardSkins = useBoardSkins();
  const plazaShare = usePlazaShare();
  const attemptedJoin = useRef(false);

  // Quick Match / VS Bot / manual-create entry params (set by "/" - see
  // app/page.tsx). Only one of code/quick/bot/maxPlayers+public is ever set
  // for a given navigation, consumed once on mount below - same pattern as
  // the existing `code` query param.
  const quickSizeParam = searchParams.get("quick");
  const botLevelParam = searchParams.get("bot");
  const maxPlayersParam = searchParams.get("maxPlayers");
  const isPublicParam = searchParams.get("public") === "1";

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
    } else if (quickSizeParam) {
      room.quickMatch(nickname, Number(quickSizeParam));
    } else if (botLevelParam) {
      room.createBotRoom(nickname, Number(botLevelParam));
    } else {
      room.createRoom(nickname, requestedMode === "standard" ? "standard" : undefined, {
        maxPlayers: maxPlayersParam ? Number(maxPlayersParam) : undefined,
        isPublic: isPublicParam,
      });
    }
    // Run once on mount only - re-running on every render would re-create/re-join.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persists this player's own board (lib/storage.ts's setStoredLastBoard,
  // via the pure lib/matchShare.ts's boardAttachmentFrom) as soon as a match
  // finishes - independent of whether "Bagikan ke Plaza" below is ever
  // clicked, since /plaza's composer "lampirkan Board" option (see
  // app/plaza/page.tsx) should have data available any time a player has
  // finished at least one match, not only right after sharing a result.
  // Re-runs (and simply overwrites with the same/newer data) on every
  // match:state received while finished, including after "Main Lagi" starts
  // and finishes a fresh match - a plain localStorage write is cheap enough
  // that re-saving identical data isn't worth guarding against.
  useEffect(() => {
    if (room.phase !== "finished" || !room.state.match) return;
    const stored = boardAttachmentFrom(room.state.match);
    if (stored) setStoredLastBoard(stored);
  }, [room.phase, room.state.match]);

  function handleLeave() {
    room.leaveRoom();
    router.push("/");
  }

  /**
   * Rematch: leave the finished room and immediately start a fresh one of
   * the SAME kind (Quick Match/VS Bot/manual create), staying on /play.
   * Both emits share one ordered socket connection, so the server always
   * sees room:leave before the next room:create/quick/createBot. Reuses
   * entryKind from the just-left room (captured before leaveRoom's
   * ack resets it) rather than the URL's ?mode= alone, so e.g. "Main Lagi"
   * after a VS Bot match starts another bot match instead of a plain room.
   */
  function handlePlayAgain() {
    const nickname = getStoredNickname();
    if (!nickname) {
      router.push("/");
      return;
    }
    const entryKind = room.state.entryKind;
    room.leaveRoom();
    if (entryKind === "quick" && quickSizeParam) {
      room.quickMatch(nickname, Number(quickSizeParam));
    } else if (entryKind === "bot" && botLevelParam) {
      room.createBotRoom(nickname, Number(botLevelParam));
    } else {
      room.createRoom(nickname, mode === "standard" ? "standard" : undefined, {
        maxPlayers: maxPlayersParam ? Number(maxPlayersParam) : undefined,
        isPublic: isPublicParam,
      });
    }
  }

  /**
   * "Bagikan ke Plaza" (CONCEPT.md §7.4b): builds a `result` PlazaAttachment
   * from real state already held by this room session (hooks/useRoom.ts's
   * `state.match`/`state.matchEnded`) - never invented numbers, matching the
   * task brief. `won`/`lines`/`calls` read straight off the viewer's own
   * MatchView entry; `opponent` only names someone when it's unambiguous
   * (the winner when this player lost, or the sole other player in a 1v1
   * win - omitted for a >2-player win, where "the opponent" isn't a single
   * person). Navigates to /plaza only after the plaza:send ack succeeds, so
   * a rate-limit/validation error (hooks/usePlazaShare.ts's `error`) stays
   * visible on this screen instead of being lost mid-navigation.
   */
  function handleShareToPlaza() {
    const view = room.state.match;
    const playerId = room.state.playerId;
    const nickname = getStoredNickname();
    if (!view || !playerId || !nickname) return;

    const me = view.players.find((player) => player.playerId === playerId);
    if (!me) return;

    const winnerId = room.state.matchEnded?.winnerId ?? view.winnerId ?? null;
    const won = winnerId === playerId;
    const others = view.players.filter((player) => player.playerId !== playerId);
    const opponent = won
      ? others.length === 1
        ? others[0]?.nickname
        : undefined
      : (others.find((player) => player.playerId === winnerId)?.nickname ?? others[0]?.nickname);

    plazaShare
      .shareResult({
        nickname,
        text: t.result.shareText,
        won,
        lines: me.lineCount,
        calls: view.calledNumbers.length,
        opponent,
      })
      .then(() => router.push("/plaza"))
      .catch(() => {
        // Intentionally ignored here - hooks/usePlazaShare.ts already
        // captured the error in its own `error` state, surfaced via
        // MatchResult's `shareError` prop below.
      });
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
    <main className="mx-auto max-w-3xl space-y-5 py-4">

      <h1 className="text-center font-display text-2xl font-bold tracking-tight text-frost">{t.title}</h1>

      {room.state.error && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-2xl border border-red-500/40 bg-red-950/60 px-4 py-2.5 text-sm text-red-200 backdrop-blur-md"
        >
          <span>{room.state.error}</span>
          <button
            type="button"
            onClick={room.clearError}
            className="shrink-0 rounded-full border border-red-400/50 px-3 py-0.5 font-display text-xs font-semibold hover:bg-red-900/60"
          >
            {strings[locale].common.dismiss}
          </button>
        </div>
      )}

      <QuestNotifications notifications={room.state.questNotifications} />

      {room.phase === null && <p className="text-center text-sm text-ice/55">{t.connecting}</p>}

      {room.phase === "lobby" && room.state.lobby && (
        <Lobby
          code={room.state.code ?? ""}
          players={room.state.lobby.players}
          hostId={room.state.lobby.hostId}
          mode={room.state.lobby.mode}
          maxPlayers={room.state.lobby.maxPlayers}
          visibility={room.state.lobby.visibility}
          isQuickMatch={room.state.entryKind === "quick"}
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
        <section className="space-y-4 rounded-3xl border border-white/10 bg-night/55 p-4 backdrop-blur-md sm:p-6">
          {me?.hasSubmittedBoard ? (
            <p className="text-center text-sm text-ice/70">{t.draft.locked}</p>
          ) : (
            <>
              {/* Heading fase draft: DraftBoard sendiri cuma merender grid-nya. */}
              <h2 className="text-center font-display text-xl font-bold text-frost">{t.draft.title}</h2>
              <DraftBoard
                numbers={draft.numbers}
                selectedIndex={draft.selectedIndex}
                onSelectCell={draft.selectCell}
                onSwapCells={draft.swapCells}
                onShuffle={draft.shuffle}
                valid={draft.validation.valid}
                validationError={draft.validation.error}
                skins={boardSkins}
              />
              <button
                type="button"
                onClick={() => room.submitDraft(draft.numbers)}
                disabled={room.state.pending || !draft.validation.valid}
                className="mx-auto block rounded-full bg-glacier-deep px-10 py-2.5 font-display text-base font-bold text-frost shadow-lg shadow-glacier-deep/40 transition-colors hover:bg-glacier disabled:cursor-not-allowed disabled:opacity-30"
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
            skins={boardSkins}
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
          // Only offered for an organically completed match (a real
          // winnerId - see handleShareToPlaza's doc) - a cancelled match
          // (player left/disconnected, no winner) has no honest "menang/
          // kalah" outcome to share.
          onShareToPlaza={
            (room.state.matchEnded?.winnerId ?? room.state.match?.winnerId) && room.state.match && room.state.playerId
              ? handleShareToPlaza
              : undefined
          }
          sharePending={plazaShare.sharing}
          shareError={plazaShare.error}
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
        <main className="py-10">
          <p className="text-center text-sm text-ice/55">{strings[locale].common.loading}</p>
        </main>
      }
    >
      <PlayScreen />
    </Suspense>
  );
}

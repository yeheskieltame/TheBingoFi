/**
 * Skill actions: useSkill (arm/apply a skill, opening a Nullify window
 * when opponents can respond) and respondToSkill (an opponent's Nullify
 * decision). Pure, no I/O - see match.ts for why the skill-shaped state
 * itself (SkillInstance, PendingSkill, ArmedState, MatchPlayer/MatchState
 * fields) lives there instead of here: it's part of MatchState's shape,
 * this file only owns the actions that move it.
 *
 * The 5 skills (CLAUDE.md / CONCEPT.md §3), effectType strings match the
 * on-chain SkillRegistry's `effectType` identifier:
 *   - WILD_DAUB   { cellIndex }  - daub 1 own cell without it being called.
 *   - DOUBLE_CALL {}             - arms 2 calls this turn instead of 1.
 *   - GHOST_CALL  {}             - arms the next call to mark for this
 *                                   player only (not the shared calledNumbers).
 *   - CELL_SWAP   { a, b }       - swap the numbers at two of this
 *                                   player's own board positions.
 *   - NULLIFY     (none)         - not used via useSkill; only a reaction,
 *                                   see respondToSkill.
 *
 * Counterplay (CONCEPT.md's skill table): WILD_DAUB, DOUBLE_CALL and
 * GHOST_CALL open a Nullify window (any opponent holding a NULLIFY charge
 * can cancel them). CELL_SWAP's listed counter is "-" - it resolves
 * immediately, no window. NULLIFY itself has no counter ("timing" per the
 * table) - it cannot be used via useSkill, and can't appear in another
 * skill's `awaiting` list.
 *
 * Error convention matches match.ts: these are actions, so they throw
 * Error with a clear message on any invalid request rather than returning
 * a result object.
 */

import { BOARD_SIZE } from "./board.ts";
import { markedCellsFor } from "./lines.ts";
import {
  checkForWinner,
  type MatchPlayer,
  type MatchState,
  type SkillArgs,
  type SkillInstance,
} from "./match.ts";

export const WILD_DAUB = "WILD_DAUB";
export const DOUBLE_CALL = "DOUBLE_CALL";
export const GHOST_CALL = "GHOST_CALL";
export const CELL_SWAP = "CELL_SWAP";
export const NULLIFY = "NULLIFY";

/** effectTypes usable via useSkill directly (everything except NULLIFY,
 *  which is reaction-only - see respondToSkill). */
const USABLE_EFFECT_TYPES: ReadonlySet<string> = new Set([WILD_DAUB, DOUBLE_CALL, GHOST_CALL, CELL_SWAP]);

/** effectTypes that open a Nullify window when used (CONCEPT.md's skill
 *  table: CELL_SWAP's counter is "-", it resolves immediately instead). */
const NULLIFIABLE_EFFECT_TYPES: ReadonlySet<string> = new Set([WILD_DAUB, DOUBLE_CALL, GHOST_CALL]);

function findPlayerIndex(state: MatchState, playerId: string): number {
  const index = state.players.findIndex((player) => player.id === playerId);
  if (index === -1) {
    throw new Error(`Unknown player id: ${playerId}`);
  }
  return index;
}

function loadoutOf(player: MatchPlayer): readonly SkillInstance[] {
  return player.loadout ?? [];
}

/**
 * Replaces one loadout entry's chargesLeft (by array index) on one player
 * (by player index), returning a new players array. Used both to consume
 * the caster's own charge (useSkill) and a responder's NULLIFY charge
 * (respondToSkill) - in both cases exactly one instance's chargesLeft
 * drops by 1, nothing else about the player changes.
 */
function consumeCharge(
  state: MatchState,
  playerIndex: number,
  instanceIndex: number,
): readonly MatchPlayer[] {
  return state.players.map((player, i) => {
    if (i !== playerIndex) return player;
    const updatedLoadout = loadoutOf(player).map((instance, j) =>
      j === instanceIndex ? { ...instance, chargesLeft: instance.chargesLeft - 1 } : instance,
    );
    return { ...player, loadout: updatedLoadout };
  });
}

/**
 * Validates `args` for `effectType` against `state`'s current marking for
 * the acting player (`callerIndex`). Throws a descriptive Error on any
 * violation. DOUBLE_CALL/GHOST_CALL take no args, so there's nothing to
 * validate for them.
 */
function validateSkillArgs(
  state: MatchState,
  callerIndex: number,
  effectType: string,
  args: SkillArgs,
): void {
  const player = state.players[callerIndex]!;

  if (effectType === WILD_DAUB) {
    const { cellIndex } = args;
    if (
      cellIndex === undefined ||
      !Number.isInteger(cellIndex) ||
      cellIndex < 0 ||
      cellIndex > BOARD_SIZE - 1
    ) {
      throw new Error(
        `WILD_DAUB requires cellIndex to be an integer between 0 and ${BOARD_SIZE - 1}, got ${cellIndex}`,
      );
    }
    const calledSet = new Set(state.calledNumbers);
    const ghostSet = new Set(player.ghostNumbers ?? []);
    const marked = markedCellsFor(player.board, calledSet, ghostSet, player.daubedCells ?? []);
    if (marked[cellIndex]) {
      throw new Error(`Cell ${cellIndex} is already marked, cannot Wild Daub it`);
    }
    return;
  }

  if (effectType === CELL_SWAP) {
    const { a, b } = args;
    const inRange = (n: number | undefined): n is number =>
      n !== undefined && Number.isInteger(n) && n >= 0 && n <= BOARD_SIZE - 1;
    if (!inRange(a) || !inRange(b)) {
      throw new Error(
        `CELL_SWAP requires a and b to be integers between 0 and ${BOARD_SIZE - 1}, got a=${a}, b=${b}`,
      );
    }
    if (a === b) {
      throw new Error("CELL_SWAP requires two distinct cell indices, got a === b");
    }
    return;
  }

  // DOUBLE_CALL / GHOST_CALL take no args - nothing to validate.
}

/**
 * Applies one skill's effect to `state` (charge already consumed by the
 * caller). WILD_DAUB and CELL_SWAP can change marking, so both finish
 * through checkForWinner (tie-broken from `playerId`, the actor).
 * DOUBLE_CALL/GHOST_CALL don't touch marking directly - they arm
 * `state.armed` for callNumber to consume on this player's next call(s).
 */
function resolveSkillEffect(
  state: MatchState,
  playerId: string,
  effectType: string,
  args: SkillArgs,
): MatchState {
  const actingIndex = findPlayerIndex(state, playerId);

  if (effectType === WILD_DAUB) {
    const cellIndex = args.cellIndex!;
    const players = state.players.map((player, i) =>
      i === actingIndex
        ? { ...player, daubedCells: [...(player.daubedCells ?? []), cellIndex] }
        : player,
    );
    return checkForWinner({ ...state, players }, playerId);
  }

  if (effectType === CELL_SWAP) {
    const a = args.a!;
    const b = args.b!;
    const players = state.players.map((player, i) => {
      if (i !== actingIndex) return player;
      const board = player.board.slice();
      const tmp = board[a]!;
      board[a] = board[b]!;
      board[b] = tmp;
      return { ...player, board };
    });
    return checkForWinner({ ...state, players }, playerId);
  }

  if (effectType === DOUBLE_CALL) {
    return { ...state, armed: { playerId, double: { callsLeft: 2 } } };
  }

  // GHOST_CALL
  return { ...state, armed: { playerId, ghost: true } };
}

/**
 * `playerId` uses `effectType` (one of WILD_DAUB/DOUBLE_CALL/GHOST_CALL/
 * CELL_SWAP - NULLIFY is reaction-only, see respondToSkill) with `args`.
 * Requires, in order: the match is in progress, no skill is already
 * pending, it's `playerId`'s turn, they haven't already used a skill this
 * turn, `effectType` is a real usable skill, they hold an available charge
 * of it, and `args` are valid for it. The charge is consumed immediately
 * regardless of what happens next (Nullify never refunds it).
 *
 * If the effect is nullifiable (WILD_DAUB/DOUBLE_CALL/GHOST_CALL) and at
 * least one opponent holds an available NULLIFY charge, this returns a
 * state with `pendingSkill` set (awaiting = those opponents' ids) and the
 * effect NOT yet applied - see respondToSkill. Otherwise (no such
 * opponents, or CELL_SWAP which never opens a window) the effect resolves
 * immediately.
 */
export function useSkill(
  state: MatchState,
  playerId: string,
  effectType: string,
  args: SkillArgs,
): MatchState {
  if (state.status === "finished") {
    throw new Error("Match has already finished, no skills can be used");
  }
  if (state.pendingSkill) {
    throw new Error("A skill is already pending a Nullify decision");
  }

  const callerIndex = findPlayerIndex(state, playerId);
  if (callerIndex !== state.currentTurnIndex) {
    const expectedId = state.players[state.currentTurnIndex]!.id;
    throw new Error(`It is not ${playerId}'s turn, expected ${expectedId}`);
  }
  if (state.skillUsedThisTurn) {
    throw new Error(`${playerId} has already used a skill this turn`);
  }

  if (effectType === NULLIFY) {
    throw new Error(
      "NULLIFY cannot be used via useSkill directly, it can only respond to a pending skill",
    );
  }
  if (!USABLE_EFFECT_TYPES.has(effectType)) {
    throw new Error(`Unknown skill effectType: ${effectType}`);
  }

  const player = state.players[callerIndex]!;
  const instanceIndex = loadoutOf(player).findIndex(
    (instance) => instance.effectType === effectType && instance.chargesLeft > 0,
  );
  if (instanceIndex === -1) {
    throw new Error(`${playerId} has no available charge for ${effectType}`);
  }

  validateSkillArgs(state, callerIndex, effectType, args);

  const players = consumeCharge(state, callerIndex, instanceIndex);
  const next: MatchState = { ...state, players, skillUsedThisTurn: true };

  if (effectType === CELL_SWAP) {
    return resolveSkillEffect(next, playerId, effectType, args);
  }

  const awaiting = NULLIFIABLE_EFFECT_TYPES.has(effectType)
    ? players
        .filter((p) => p.id !== playerId)
        .filter((p) =>
          loadoutOf(p).some((instance) => instance.effectType === NULLIFY && instance.chargesLeft > 0),
        )
        .map((p) => p.id)
    : [];

  if (awaiting.length === 0) {
    return resolveSkillEffect(next, playerId, effectType, args);
  }

  return { ...next, pendingSkill: { playerId, effectType, args, awaiting } };
}

/**
 * `playerId` (must be in `state.pendingSkill.awaiting`) answers the open
 * Nullify window. `useNullify = true`: consumes `playerId`'s own NULLIFY
 * charge and cancels the pending skill outright - the original caster's
 * charge stays spent (Nullify doesn't refund it), and the effect never
 * applies. `useNullify = false`: `playerId` drops out of `awaiting`; once
 * `awaiting` is empty (everyone remaining has passed), the skill resolves.
 */
export function respondToSkill(state: MatchState, playerId: string, useNullify: boolean): MatchState {
  const pending = state.pendingSkill;
  if (!pending) {
    throw new Error("No skill is pending a Nullify decision");
  }
  if (!pending.awaiting.includes(playerId)) {
    throw new Error(`${playerId} is not awaiting a Nullify decision for the pending skill`);
  }

  if (useNullify) {
    const responderIndex = findPlayerIndex(state, playerId);
    const nullifyIndex = loadoutOf(state.players[responderIndex]!).findIndex(
      (instance) => instance.effectType === NULLIFY && instance.chargesLeft > 0,
    );
    if (nullifyIndex === -1) {
      throw new Error(`${playerId} has no available NULLIFY charge`);
    }
    const players = consumeCharge(state, responderIndex, nullifyIndex);
    return { ...state, players, pendingSkill: undefined };
  }

  const remainingAwaiting = pending.awaiting.filter((id) => id !== playerId);
  if (remainingAwaiting.length === 0) {
    const resolved = resolveSkillEffect(state, pending.playerId, pending.effectType, pending.args);
    return { ...resolved, pendingSkill: undefined };
  }

  return { ...state, pendingSkill: { ...pending, awaiting: remainingAwaiting } };
}

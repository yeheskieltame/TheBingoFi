/**
 * VS Bot AI (CONCEPT.md §2b): a pure, deterministic-when-seeded opponent for
 * solo play - 10 difficulty levels, Lv1 near-random up to Lv10 always
 * picking the locally-optimal call. Pure, no I/O - same house style as
 * ../engine (a bot "turn" is just a function from public match state to a
 * number, executed by the realtime layer exactly like a human's match:call).
 *
 * Fairness (CONCEPT.md §2b: "bot hanya tahu info publik - tidak pernah
 * lihat board pemain"): every function here takes only the bot's OWN board
 * plus calledNumbers (both already public/shared - calledNumbers is
 * MatchState-wide, and the bot's own board is naturally visible to itself
 * the same way a human sees their own board). No function in this module
 * ever takes or reads an opponent's board - that's not a policy check, it's
 * structural: there is no parameter to pass one through.
 */

import { type Board, BOARD_SIZE, MAX_NUMBER, MIN_NUMBER } from "../engine/board.ts";
import { LINES } from "../engine/lines.ts";

export const MIN_BOT_LEVEL = 1;
export const MAX_BOT_LEVEL = 10;

/**
 * A repeatable stream of pseudo-random floats in [0, 1), injected rather
 * than read from a global - deterministic in tests, `Math.random` in
 * production (see realtime/rooms.ts's createBotRoom /
 * realtime/server.ts's bot-turn scheduling, which pass `Math.random`
 * directly - same shape ../daily/challenge.ts's internal PRNG produces,
 * kept as a plain function type here instead of importing that module's
 * private generator so this stays decoupled from the daily challenge).
 */
export type Rng = () => number;

/**
 * Draft-phase board arrangement for a bot: a uniformly random permutation
 * of 1-25 (Fisher-Yates, same algorithm as ../daily/challenge.ts's
 * callSequence).
 *
 * Deliberately NOT "optimized" in any way: unlike calling (pickCall below),
 * where each turn's candidates and their value depend on what's already
 * been called, board placement happens once, before any number is called
 * and before the bot has any information to react to. Every arrangement is
 * strategically equivalent at draft time - what matters is which numbers
 * end up adjacent on lines, and pickCall's greedy scoring already adapts to
 * whatever arrangement resulted, favoring calls that complete the bot's
 * own near-finished lines regardless of where their numbers happen to sit.
 * So a random arrangement is not a weaker bot, it's simply the neutral
 * choice for a step that has nothing yet to optimize against.
 */
export function arrangeBoard(rng: Rng): Board {
  const board = Array.from({ length: BOARD_SIZE }, (_, i) => i + 1);
  for (let i = board.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [board[i], board[j]] = [board[j]!, board[i]!];
  }
  return board;
}

/**
 * Epsilon-greedy explore probability for a given difficulty level (1-10):
 * Lv1 -> 0.9 (90% random), Lv10 -> 0 (always the greedy pick). Linear in
 * between. Exported mainly so it's directly testable without going through
 * pickCall's rng plumbing.
 */
export function epsilonForLevel(level: number): number {
  return (MAX_BOT_LEVEL - level) / MAX_BOT_LEVEL;
}

/**
 * Greedy value of calling `candidate` next, given the bot's own `board` and
 * what's been called so far (`calledSet`). Sums, over every one of the 12
 * LINES that passes through `candidate`'s cell on `board`: +1000 if calling
 * it would complete that line outright (every other cell on the line is
 * already marked), otherwise +(already-marked cell count on that line)^2 -
 * a quadratic reward for lines that are close to done, so the bot prefers
 * finishing a near-complete line over lightly progressing several others.
 * A cell can sit on 2-4 lines (row + column, plus 1-2 diagonals), so this
 * is a sum, not a single line's score.
 */
function scoreCandidate(board: Board, calledSet: ReadonlySet<number>, candidate: number): number {
  const cellIndex = board.indexOf(candidate);
  let total = 0;
  for (const line of LINES) {
    if (!line.includes(cellIndex)) continue;
    const markedCount = line.reduce((count, index) => count + (calledSet.has(board[index]!) ? 1 : 0), 0);
    total += markedCount === 4 ? 1000 : markedCount ** 2;
  }
  return total;
}

/**
 * Picks the bot's next call: candidates are every number 1-25 not yet in
 * `calledNumbers` (the bot may call ANY uncalled number, not just ones on
 * its own board - same as a human player). Epsilon-greedy over
 * `scoreCandidate` per `epsilonForLevel(level)`:
 *  - draws one `rng()` value; if it's < epsilon, calls `rng()` again to pick
 *    a uniformly random candidate (explore).
 *  - otherwise (probability 1 - epsilon, and always at Lv10 where epsilon
 *    is exactly 0) picks the candidate with the highest scoreCandidate,
 *    ties broken toward the lower candidate number (deterministic, no
 *    further rng draw) - this is what makes Lv10 fully deterministic given
 *    a fixed board/calledNumbers, regardless of what `rng` returns.
 *
 * `rng` is injected (see Rng above) so both branches are test-deterministic
 * without touching Math.random. Throws if every number 1-25 has already
 * been called (unreachable in a real match: the engine ends the match once
 * someone completes 5 lines, always well before all 25 are called).
 */
export function pickCall(
  board: Board,
  calledNumbers: readonly number[],
  level: number,
  rng: Rng,
): number {
  const calledSet = new Set(calledNumbers);
  const candidates: number[] = [];
  for (let n = MIN_NUMBER; n <= MAX_NUMBER; n++) {
    if (!calledSet.has(n)) candidates.push(n);
  }
  if (candidates.length === 0) {
    throw new Error("pickCall: no uncalled numbers remain");
  }

  const epsilon = epsilonForLevel(level);
  if (rng() < epsilon) {
    const index = Math.floor(rng() * candidates.length);
    return candidates[index]!;
  }

  let best = candidates[0]!;
  let bestScore = scoreCandidate(board, calledSet, best);
  for (let i = 1; i < candidates.length; i++) {
    const candidate = candidates[i]!;
    const score = scoreCandidate(board, calledSet, candidate);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

/** `bot:<uuid>` - see realtime/rooms.ts's createBotRoom. A tiny shared predicate so any layer (views, quest wiring) can recognize a bot player id without importing rooms.ts's Room shape. */
export function isBotPlayerId(playerId: string): boolean {
  return playerId.startsWith("bot:");
}

/**
 * Integration tests for the realtime layer: real Socket.IO client <-> real
 * Socket.IO server (over a real ephemeral-port HTTP server), exercising
 * the whole path room:create -> room:join -> draft:start -> draft:submit
 * -> match:call the same way a browser client would, via the ack-callback
 * pattern. Engine/quest correctness is already covered by their own unit
 * tests - this file is about the transport/redaction/error-boundary layer
 * wired on top of them.
 */

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server as NodeHttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { io as ioClient, type Socket as ClientSocket } from "socket.io-client";
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";

import { BOARD_SIZE, NULLIFY, WILD_DAUB, type SkillInstance } from "../engine/index.ts";
import { exampleQuests } from "../quest/index.ts";
import { createRealtimeServer, type LoadoutVerifier, type RealtimeServerOptions } from "./server.ts";

type AckResponse = ({ ok: true } & Record<string, unknown>) | { ok: false; error: string };

/** 1..25 in row-major order. */
function identityBoard(): number[] {
  return Array.from({ length: BOARD_SIZE }, (_, i) => i + 1);
}

/** identityBoard shifted by +1 (mod 25): [2,3,...,25,1] - still a valid, unrelated permutation. */
function shiftedBoard(): number[] {
  return Array.from({ length: BOARD_SIZE }, (_, i) => ((i + 1) % BOARD_SIZE) + 1);
}

function emit(socket: ClientSocket, event: string, payload: unknown): Promise<AckResponse> {
  return new Promise((resolve) => {
    socket.emit(event, payload, (response: AckResponse) => resolve(response));
  });
}

function waitForEvent<T>(socket: ClientSocket, event: string): Promise<T> {
  return new Promise((resolve) => socket.once(event, (payload: T) => resolve(payload)));
}

/**
 * A pull-based queue over every `event` a socket receives, in order -
 * needed for the VS Bot test below, where a single socket receives a whole
 * SEQUENCE of match:state broadcasts (its own calls AND the bot's, all on
 * the same connection) and the test needs to consume them one at a time in
 * delivery order rather than racing multiple `.once` listeners against
 * each other.
 */
function eventQueue<T>(socket: ClientSocket, event: string): () => Promise<T> {
  const buffered: T[] = [];
  const waiters: ((value: T) => void)[] = [];
  socket.on(event, (payload: T) => {
    const waiter = waiters.shift();
    if (waiter) waiter(payload);
    else buffered.push(payload);
  });
  return () =>
    new Promise<T>((resolve) => {
      const next = buffered.shift();
      if (next !== undefined) resolve(next);
      else waiters.push(resolve);
    });
}

/** Recursively collects every array of exactly length 25 anywhere inside `value`. */
function collectBoardSizedArrays(value: unknown, out: unknown[][] = []): unknown[][] {
  if (Array.isArray(value)) {
    if (value.length === BOARD_SIZE) out.push(value);
    for (const item of value) collectBoardSizedArrays(item, out);
  } else if (value !== null && typeof value === "object") {
    for (const item of Object.values(value as Record<string, unknown>)) collectBoardSizedArrays(item, out);
  }
  return out;
}

let httpServer: NodeHttpServer;
let port: number;
let sockets: ClientSocket[];

beforeEach(async () => {
  httpServer = createServer();
  createRealtimeServer(httpServer);
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  port = (httpServer.address() as AddressInfo).port;
  sockets = [];
});

afterEach(async () => {
  for (const socket of sockets) socket.disconnect();
  sockets = [];
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
});

function connectClient(): Promise<ClientSocket> {
  return new Promise((resolve, reject) => {
    const socket = ioClient(`http://localhost:${port}`, { reconnection: false, forceNew: true });
    sockets.push(socket);
    socket.once("connect", () => resolve(socket));
    socket.once("connect_error", reject);
  });
}

/**
 * Runs `body` against a freshly created, fully independent realtime server
 * (its own httpServer/port/sockets, closed in a `finally`) rather than the
 * shared beforeEach/afterEach one above - needed for tests that require a
 * specific `RealtimeServerOptions` (a mock LoadoutVerifier, or none at all),
 * which the shared server (always created with no opts) can't provide.
 */
async function withServer<T>(
  opts: RealtimeServerOptions,
  body: (ctx: { connect: () => Promise<ClientSocket> }) => Promise<T>,
): Promise<T> {
  const srv = createServer();
  createRealtimeServer(srv, opts);
  await new Promise<void>((resolve) => srv.listen(0, resolve));
  const srvPort = (srv.address() as AddressInfo).port;
  const localSockets: ClientSocket[] = [];

  const connect = (): Promise<ClientSocket> =>
    new Promise((resolve, reject) => {
      const socket = ioClient(`http://localhost:${srvPort}`, { reconnection: false, forceNew: true });
      localSockets.push(socket);
      socket.once("connect", () => resolve(socket));
      socket.once("connect_error", reject);
    });

  try {
    return await body({ connect });
  } finally {
    for (const socket of localSockets) socket.disconnect();
    await new Promise<void>((resolve) => srv.close(() => resolve()));
  }
}

/** wallet:nonce -> sign the returned message -> wallet:link, in one call. Returns the wallet:link ack. */
async function linkWallet(socket: ClientSocket, account: PrivateKeyAccount): Promise<AckResponse> {
  const nonceRes = await emit(socket, "wallet:nonce", {});
  assert.equal(nonceRes.ok, true, `wallet:nonce should succeed: ${JSON.stringify(nonceRes)}`);
  if (!nonceRes.ok) throw new Error("unreachable");
  const message = nonceRes.message as string;
  const signature = await account.signMessage({ message });
  return emit(socket, "wallet:link", { address: account.address, signature });
}

interface TwoPlayerMatch {
  readonly host: ClientSocket;
  readonly guest: ClientSocket;
  readonly hostId: string;
  readonly guestId: string;
  readonly code: string;
  /** The very first match:state each side received, i.e. right as the room flipped to "playing" (calledNumbers still empty). */
  readonly hostFirstMatchState: Record<string, unknown>;
  readonly guestFirstMatchState: Record<string, unknown>;
}

/**
 * Full setup through the socket API: host creates a room, guest joins,
 * host starts the draft, host submits identityBoard(), guest submits
 * shiftedBoard(). Once both boards are in, the room flips to "playing"
 * with the host on turn 0 (host joins first, turn order = join order).
 *
 * The submitBoard ack that completes the draft also triggers the first
 * match:state broadcast, so the "first match:state" listeners are attached
 * before that submit fires - a listener attached afterwards would miss it.
 */
async function setupTwoPlayerMatch(): Promise<TwoPlayerMatch> {
  const host = await connectClient();
  const guest = await connectClient();

  const created = await emit(host, "room:create", { nickname: "Host" });
  assert.equal(created.ok, true);
  if (!created.ok) throw new Error("unreachable");
  const code = created.code as string;
  const hostId = created.playerId as string;

  const joined = await emit(guest, "room:join", { code, nickname: "Guest" });
  assert.equal(joined.ok, true);
  if (!joined.ok) throw new Error("unreachable");
  const guestId = joined.playerId as string;

  const started = await emit(host, "draft:start", {});
  assert.equal(started.ok, true);

  const hostSubmit = await emit(host, "draft:submit", { numbers: identityBoard() });
  assert.equal(hostSubmit.ok, true);

  const hostFirstMatchStatePromise = waitForEvent<Record<string, unknown>>(host, "match:state");
  const guestFirstMatchStatePromise = waitForEvent<Record<string, unknown>>(guest, "match:state");

  const guestSubmit = await emit(guest, "draft:submit", { numbers: shiftedBoard() });
  assert.equal(guestSubmit.ok, true);

  const [hostFirstMatchState, guestFirstMatchState] = await Promise.all([
    hostFirstMatchStatePromise,
    guestFirstMatchStatePromise,
  ]);

  return { host, guest, hostId, guestId, code, hostFirstMatchState, guestFirstMatchState };
}

test("full 2-player game: alternating calls to a winner, match:ended fires with the right winner", async () => {
  const { host, guest, hostId } = await setupTwoPlayerMatch();

  // identityBoard (host) vs shiftedBoard (guest), alternating 1..21 starting
  // with the host: both cross 5 completed lines the instant 21 is called,
  // and the caller (host, since 21 is odd => host's turn) wins the tie -
  // same scenario proven deterministically in engine/match.test.ts.
  for (let n = 1; n <= 20; n++) {
    const caller = n % 2 === 1 ? host : guest;
    const result = await emit(caller, "match:call", { number: n });
    assert.equal(result.ok, true, `call ${n} should succeed`);
  }

  const matchEnded = waitForEvent<{ winnerId: string | null }>(host, "match:ended");
  const finalCall = await emit(host, "match:call", { number: 21 });
  assert.equal(finalCall.ok, true);
  if (!finalCall.ok) throw new Error("unreachable");
  const finalView = finalCall.view as { status: string; winnerId?: string };
  assert.equal(finalView.status, "finished");
  assert.equal(finalView.winnerId, hostId);

  const endedPayload = await matchEnded;
  assert.equal(endedPayload.winnerId, hostId);

  void guest; // guest is only used to make/receive calls above
});

test("match:state redaction: a player's payload never contains another player's board", async () => {
  const { hostFirstMatchState: hostState, guestFirstMatchState: guestState } = await setupTwoPlayerMatch();

  assert.deepEqual(hostState.board, identityBoard());
  assert.deepEqual(guestState.board, shiftedBoard());

  // No opponent board anywhere: exactly one board-sized (25) array in each
  // payload, and it must be the viewer's own.
  const hostArrays = collectBoardSizedArrays(hostState);
  assert.equal(hostArrays.length, 1);
  assert.deepEqual(hostArrays[0], identityBoard());

  const guestArrays = collectBoardSizedArrays(guestState);
  assert.equal(guestArrays.length, 1);
  assert.deepEqual(guestArrays[0], shiftedBoard());

  // Public per-player entries carry no board field at all.
  const players = hostState.players as ReadonlyArray<Record<string, unknown>>;
  for (const player of players) {
    assert.equal("board" in player, false);
  }
});

test("calling out of turn returns an ack error, not a crash", async () => {
  const { guest } = await setupTwoPlayerMatch();

  // It's the host's turn (turn index 0); guest tries to call first.
  const result = await emit(guest, "match:call", { number: 7 });
  assert.equal(result.ok, false);
  if (result.ok) throw new Error("unreachable");
  assert.match(result.error, /turn/i);
});

test("calling an already-called number returns an ack error", async () => {
  const { host, guest } = await setupTwoPlayerMatch();

  const first = await emit(host, "match:call", { number: 9 });
  assert.equal(first.ok, true);

  const duplicate = await emit(guest, "match:call", { number: 9 });
  assert.equal(duplicate.ok, false);
  if (duplicate.ok) throw new Error("unreachable");
  assert.match(duplicate.error, /already/i);
});

test("joining a room with a nonexistent code returns an ack error", async () => {
  const client = await connectClient();

  const result = await emit(client, "room:join", { code: "ZZZZZZ", nickname: "Nobody" });
  assert.equal(result.ok, false);
  if (result.ok) throw new Error("unreachable");
  assert.match(result.error, /not found/i);
});

test("a 6th join to an already-full (default 5-player) room returns an ack error", async () => {
  const host = await connectClient();
  const created = await emit(host, "room:create", { nickname: "Host" });
  assert.equal(created.ok, true);
  if (!created.ok) throw new Error("unreachable");
  const code = created.code as string;

  // 4 more joins fill the room to the default MAX_PLAYERS (5).
  for (let i = 0; i < 4; i++) {
    const guest = await connectClient();
    const joined = await emit(guest, "room:join", { code, nickname: `Guest${i}` });
    assert.equal(joined.ok, true, `join #${i + 2} should succeed`);
  }

  const overflow = await connectClient();
  const result = await emit(overflow, "room:join", { code, nickname: "OneTooMany" });
  assert.equal(result.ok, false);
  if (result.ok) throw new Error("unreachable");
  assert.match(result.error, /full/i);
});

test("room:create maxPlayers is honored: a 3rd join to a 2-player room is rejected", async () => {
  const host = await connectClient();
  const created = await emit(host, "room:create", { nickname: "Host", maxPlayers: 2 });
  assert.equal(created.ok, true);
  if (!created.ok) throw new Error("unreachable");
  const code = created.code as string;
  assert.equal((created.view as { maxPlayers: number }).maxPlayers, 2);

  const guest = await connectClient();
  const joined = await emit(guest, "room:join", { code, nickname: "Guest" });
  assert.equal(joined.ok, true);

  const overflow = await connectClient();
  const result = await emit(overflow, "room:join", { code, nickname: "OneTooMany" });
  assert.equal(result.ok, false);
  if (result.ok) throw new Error("unreachable");
  assert.match(result.error, /full/i);
});

// -- matchmaking: room:list, room:quick, room:createBot (CONCEPT.md §2b) --

test("room:list lists public rooms with an open slot, hides private rooms, and drops full rooms", async () => {
  const publicHost = await connectClient();
  const publicCreated = await emit(publicHost, "room:create", {
    nickname: "PublicHost",
    isPublic: true,
    maxPlayers: 3,
  });
  assert.equal(publicCreated.ok, true);
  if (!publicCreated.ok) throw new Error("unreachable");
  const publicCode = publicCreated.code as string;

  const privateHost = await connectClient();
  const privateCreated = await emit(privateHost, "room:create", { nickname: "PrivateHost" });
  assert.equal(privateCreated.ok, true);
  if (!privateCreated.ok) throw new Error("unreachable");
  const privateCode = privateCreated.code as string;

  const fullHost = await connectClient();
  const fullCreated = await emit(fullHost, "room:create", { nickname: "FullHost", isPublic: true, maxPlayers: 2 });
  assert.equal(fullCreated.ok, true);
  if (!fullCreated.ok) throw new Error("unreachable");
  const fullCode = fullCreated.code as string;
  const fullGuest = await connectClient();
  const fullJoin = await emit(fullGuest, "room:join", { code: fullCode, nickname: "FullGuest" });
  assert.equal(fullJoin.ok, true);

  const lister = await connectClient();
  const listRes = await emit(lister, "room:list", {});
  assert.equal(listRes.ok, true);
  if (!listRes.ok) throw new Error("unreachable");
  const rooms = listRes.rooms as { code: string; hostNickname: string; playerCount: number; maxPlayers: number; mode: string }[];

  const publicEntry = rooms.find((r) => r.code === publicCode);
  assert.deepEqual(
    publicEntry,
    { code: publicCode, hostNickname: "PublicHost", playerCount: 1, maxPlayers: 3, mode: "casual" },
    "public room with an open slot should be listed, with only the summary fields",
  );

  assert.ok(!rooms.some((r) => r.code === privateCode), "a private room must never be listed");
  assert.ok(!rooms.some((r) => r.code === fullCode), "a full room must not be listed even though it's public");
});

test("room:quick matches two players into the same auto-start room, which auto-starts the draft, and the match plays to completion", async () => {
  const a = await connectClient();
  const b = await connectClient();

  const first = await emit(a, "room:quick", { nickname: "Alice", size: 2 });
  assert.equal(first.ok, true);
  if (!first.ok) throw new Error("unreachable");
  assert.equal((first.view as { phase: string }).phase, "lobby", "not full yet - room:quick alone doesn't force draft");

  const draftBroadcastPromise = waitForEvent<{ phase: string }>(a, "room:state");
  const second = await emit(b, "room:quick", { nickname: "Bob", size: 2 });
  assert.equal(second.ok, true);
  if (!second.ok) throw new Error("unreachable");
  assert.equal(second.code, first.code, "the second room:quick call should join the same room, not create a new one");
  assert.equal(
    (second.view as { phase: string }).phase,
    "draft",
    "the room fills and auto-starts the draft with no host action",
  );

  const draftBroadcast = await draftBroadcastPromise;
  assert.equal(draftBroadcast.phase, "draft", "the other player sees the same auto-start via room:state");

  // From here on this is exactly setupTwoPlayerMatch's flow/board pair - a
  // (the room's creator, turn index 0) vs b, alternating 1..21 with a
  // winning the tie on 21 (see engine/match.test.ts for the underlying math).
  const aFirstMatchState = waitForEvent<Record<string, unknown>>(a, "match:state");
  const bFirstMatchState = waitForEvent<Record<string, unknown>>(b, "match:state");
  const aSubmit = await emit(a, "draft:submit", { numbers: identityBoard() });
  assert.equal(aSubmit.ok, true);
  const bSubmit = await emit(b, "draft:submit", { numbers: shiftedBoard() });
  assert.equal(bSubmit.ok, true);
  await Promise.all([aFirstMatchState, bFirstMatchState]);

  for (let n = 1; n <= 20; n++) {
    const caller = n % 2 === 1 ? a : b;
    const result = await emit(caller, "match:call", { number: n });
    assert.equal(result.ok, true, `call ${n} should succeed`);
  }

  const matchEnded = waitForEvent<{ winnerId: string | null }>(a, "match:ended");
  const finalCall = await emit(a, "match:call", { number: 21 });
  assert.equal(finalCall.ok, true);
  if (!finalCall.ok) throw new Error("unreachable");
  const finalView = finalCall.view as { status: string; winnerId?: string };
  assert.equal(finalView.status, "finished");
  assert.equal(finalView.winnerId, first.playerId);

  const ended = await matchEnded;
  assert.equal(ended.winnerId, first.playerId);
});

test("room:createBot: a full game against a Lv10 bot always runs to completion without hanging (botDelayMs 0), and the bot's board never leaks", async () => {
  await withServer({ botDelayMs: 0 }, async ({ connect }) => {
    const human = await connect();

    const created = await emit(human, "room:createBot", { nickname: "Solo", level: 10 });
    assert.equal(created.ok, true);
    if (!created.ok) throw new Error("unreachable");
    const humanId = created.playerId as string;
    const view = created.view as {
      phase: string;
      players: { playerId: string; nickname: string; isBot: boolean }[];
    };
    assert.equal(view.phase, "draft", "VS Bot skips the lobby entirely - match starts instantly");
    const botEntry = view.players.find((p) => p.isBot);
    assert.ok(botEntry, "expected exactly one bot player in the lobby view");
    assert.match(botEntry!.nickname, /Bot Lv10/);

    const nextState = eventQueue<Record<string, unknown>>(human, "match:state");
    const matchEnded = waitForEvent<{ winnerId: string | null }>(human, "match:ended");

    const submitRes = await emit(human, "draft:submit", { numbers: identityBoard() });
    assert.equal(submitRes.ok, true, `expected draft:submit to succeed: ${JSON.stringify(submitRes)}`);

    // First broadcast once both boards are in: calledNumbers still empty.
    let state = await nextState();
    assert.deepEqual(state.calledNumbers, []);
    // The bot's board must never appear anywhere in the human's own view.
    for (const player of state.players as Record<string, unknown>[]) {
      assert.equal("board" in player, false, "no player entry (including the bot's) may carry a board field");
    }

    const called = new Set<number>();
    let guard = 0;
    // Loop bound generously above the true worst case (<=25 calls total in
    // any bingo match) - this is a safety net against a genuine hang, not a
    // substitute for the match actually finishing.
    while (state.status !== "finished" && guard < 30) {
      guard++;
      if (state.currentTurnPlayerId === humanId) {
        let n = 1;
        while (called.has(n)) n++;
        called.add(n);
        const callRes = await emit(human, "match:call", { number: n });
        assert.equal(callRes.ok, true, `expected human's call to succeed: ${JSON.stringify(callRes)}`);
      }
      state = await nextState();
      for (const n of state.calledNumbers as number[]) called.add(n);
    }

    assert.equal(state.status, "finished", "the match must terminate, whoever wins");
    const ended = await matchEnded;
    assert.ok(
      ended.winnerId === humanId || ended.winnerId === botEntry!.playerId,
      `winner must be the human or the bot, got ${ended.winnerId}`,
    );
  });
});

test("room:leave from a VS Bot room deletes the room outright - no zombie room left with just the bot in it", async () => {
  await withServer({ botDelayMs: 0 }, async ({ connect }) => {
    const human = await connect();
    const created = await emit(human, "room:createBot", { nickname: "Solo", level: 1 });
    assert.equal(created.ok, true);
    if (!created.ok) throw new Error("unreachable");
    const code = created.code as string;

    // Match is already "playing" (bot submitted at creation, human submits now).
    const submitRes = await emit(human, "draft:submit", { numbers: identityBoard() });
    assert.equal(submitRes.ok, true, "match should be underway (bot already submitted at room creation)");

    const leaveRes = await emit(human, "room:leave", {});
    assert.equal(leaveRes.ok, true);

    const prober = await connect();
    const joinRes = await emit(prober, "room:join", { code, nickname: "Prober" });
    assert.equal(joinRes.ok, false);
    if (joinRes.ok) throw new Error("unreachable");
    assert.match(joinRes.error, /not found/i, "the room must be gone entirely, not just aborted");
  });
});

test("a human's socket disconnecting from a VS Bot room leaves no zombie room behind, even mid-draft before submitting a board", async () => {
  const human = await connectClient();
  const created = await emit(human, "room:createBot", { nickname: "Solo", level: 1 });
  assert.equal(created.ok, true);
  if (!created.ok) throw new Error("unreachable");
  const code = created.code as string;
  assert.equal(
    (created.view as { phase: string }).phase,
    "draft",
    "bot already submitted, human has not yet - room.players has 2 entries here",
  );

  human.disconnect();

  // The server processes the disconnect asynchronously (after the transport
  // actually tears down), so poll room:join with bounded retries instead of
  // a single arbitrary sleep - on a local loopback connection this settles
  // within a handful of milliseconds in practice.
  let joinRes: AckResponse | undefined;
  for (let attempt = 0; attempt < 20; attempt++) {
    const prober = await connectClient();
    joinRes = await emit(prober, "room:join", { code, nickname: `Prober${attempt}` });
    if (!joinRes.ok) break;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  assert.ok(joinRes && !joinRes.ok, "expected the room to eventually disappear once the disconnect is processed");
  if (!joinRes || joinRes.ok) throw new Error("unreachable");
  assert.match(joinRes.error, /not found/i);
});

test("the winner receives quest:completed for the daily win-1-match quest", async () => {
  const { host, guest, hostId } = await setupTwoPlayerMatch();

  const dailyWinQuest = exampleQuests.find((q) => q.id === "daily_win_1_match");
  assert.ok(dailyWinQuest, "exampleQuests must define daily_win_1_match");

  for (let n = 1; n <= 20; n++) {
    const caller = n % 2 === 1 ? host : guest;
    await emit(caller, "match:call", { number: n });
  }

  // The winning call also completes the diagonal line quest on the same
  // event, so quest:completed may fire more than once here - collect
  // everything and look for the win quest specifically, rather than
  // assuming it's the first one emitted.
  const questsCompleted: { questId: string; title: string }[] = [];
  host.on("quest:completed", (payload: { questId: string; title: string }) => questsCompleted.push(payload));

  const matchEnded = waitForEvent(host, "match:ended");
  const finalCall = await emit(host, "match:call", { number: 21 });
  assert.equal(finalCall.ok, true);
  if (!finalCall.ok) throw new Error("unreachable");
  assert.equal((finalCall.view as { winnerId?: string }).winnerId, hostId);

  // match:ended is emitted after quest:completed within the same handler,
  // and both travel over the same connection, so by the time match:ended
  // is received every quest:completed from this call has already arrived.
  await matchEnded;

  const winQuestPayload = questsCompleted.find((q) => q.questId === dailyWinQuest!.id);
  assert.ok(winQuestPayload, `expected a quest:completed for ${dailyWinQuest!.id}, got: ${JSON.stringify(questsCompleted)}`);
  assert.equal(winQuestPayload.title, dailyWinQuest!.title);
});

// -- wallet link ----------------------------------------------------------
//
// Real signature flow, no chain involved: wallet:link only needs viem's
// standalone verifyMessage (pure signature recovery), so these use real
// viem accounts (privateKeyToAccount + signMessage) end-to-end against the
// shared default server (no verifyLoadout needed for wallet:link itself).

test("wallet:nonce then wallet:link with a valid signature succeeds and lowercases the address", async () => {
  const socket = await connectClient();
  const account = privateKeyToAccount(generatePrivateKey());

  const linkRes = await linkWallet(socket, account);
  assert.equal(linkRes.ok, true, `expected success, got: ${JSON.stringify(linkRes)}`);
  if (!linkRes.ok) throw new Error("unreachable");
  assert.equal(linkRes.address, account.address.toLowerCase());
});

test("wallet:link rejects a signature from a different key than the claimed address", async () => {
  const socket = await connectClient();
  const claimedAccount = privateKeyToAccount(generatePrivateKey());
  const signerAccount = privateKeyToAccount(generatePrivateKey());

  const nonceRes = await emit(socket, "wallet:nonce", {});
  assert.equal(nonceRes.ok, true);
  if (!nonceRes.ok) throw new Error("unreachable");
  const message = nonceRes.message as string;
  const signature = await signerAccount.signMessage({ message });

  const linkRes = await emit(socket, "wallet:link", { address: claimedAccount.address, signature });
  assert.equal(linkRes.ok, false);
  if (linkRes.ok) throw new Error("unreachable");
  assert.match(linkRes.error, /signature/i);
});

test("wallet:link rejects a corrupted signature", async () => {
  const socket = await connectClient();
  const account = privateKeyToAccount(generatePrivateKey());

  const nonceRes = await emit(socket, "wallet:nonce", {});
  assert.equal(nonceRes.ok, true);
  if (!nonceRes.ok) throw new Error("unreachable");
  const message = nonceRes.message as string;
  const validSignature = await account.signMessage({ message });
  // Flip the last hex character - still well-formed hex, just cryptographically wrong.
  const lastChar = validSignature.at(-1)!;
  const flippedChar = lastChar === "0" ? "1" : "0";
  const corruptedSignature = validSignature.slice(0, -1) + flippedChar;

  const linkRes = await emit(socket, "wallet:link", { address: account.address, signature: corruptedSignature });
  assert.equal(linkRes.ok, false);
});

test("wallet:link without a prior wallet:nonce is rejected", async () => {
  const socket = await connectClient();
  const account = privateKeyToAccount(generatePrivateKey());
  const signature = await account.signMessage({ message: "TheBingoFi wallet link\nnonce: made-up" });

  const linkRes = await emit(socket, "wallet:link", { address: account.address, signature });
  assert.equal(linkRes.ok, false);
  if (linkRes.ok) throw new Error("unreachable");
  assert.match(linkRes.error, /nonce/i);
});

test("a nonce cannot be replayed: a second wallet:link after a successful one fails", async () => {
  const socket = await connectClient();
  const account = privateKeyToAccount(generatePrivateKey());

  const nonceRes = await emit(socket, "wallet:nonce", {});
  assert.equal(nonceRes.ok, true);
  if (!nonceRes.ok) throw new Error("unreachable");
  const message = nonceRes.message as string;
  const signature = await account.signMessage({ message });

  const first = await emit(socket, "wallet:link", { address: account.address, signature });
  assert.equal(first.ok, true);

  // Same signature/message, no new wallet:nonce requested in between.
  const replay = await emit(socket, "wallet:link", { address: account.address, signature });
  assert.equal(replay.ok, false);
  if (replay.ok) throw new Error("unreachable");
  assert.match(replay.error, /nonce/i);
});

test("wallet:link before room:create carries the wallet into the new room's LobbyView", async () => {
  const socket = await connectClient();
  const account = privateKeyToAccount(generatePrivateKey());

  const linkRes = await linkWallet(socket, account);
  assert.equal(linkRes.ok, true);

  const created = await emit(socket, "room:create", { nickname: "Alice" });
  assert.equal(created.ok, true);
  if (!created.ok) throw new Error("unreachable");
  const view = created.view as { players: { wallet?: string }[] };
  assert.equal(view.players[0]!.wallet, account.address.toLowerCase());
});

test("wallet:link after already joining a room updates and broadcasts room:state with the wallet", async () => {
  const host = await connectClient();
  const guest = await connectClient();
  const account = privateKeyToAccount(generatePrivateKey());

  const created = await emit(host, "room:create", { nickname: "Host" });
  assert.equal(created.ok, true);
  if (!created.ok) throw new Error("unreachable");
  const code = created.code as string;

  // room:join itself triggers a room:state broadcast to everyone already in
  // the channel (including the joiner) - drain that one first so the
  // listener below can't race against it and resolve early with stale
  // (pre-link) state. See setupTwoPlayerMatch's comment for the same
  // pattern (attach-before-trigger) applied to match:state.
  const joinBroadcast = waitForEvent(guest, "room:state");
  await emit(guest, "room:join", { code, nickname: "Guest" });
  await joinBroadcast;

  const roomStatePromise = waitForEvent<{ players: { playerId: string; wallet?: string }[] }>(guest, "room:state");
  const linkRes = await linkWallet(host, account);
  assert.equal(linkRes.ok, true);

  const roomState = await roomStatePromise;
  const hostPlayerId = created.playerId as string;
  const hostEntry = roomState.players.find((p) => p.playerId === hostPlayerId);
  assert.equal(hostEntry?.wallet, account.address.toLowerCase());
});

// -- mode + loadout ---------------------------------------------------------
//
// These use withServer(...) rather than the shared default server, since
// each needs its own RealtimeServerOptions (a mock LoadoutVerifier, or none
// at all to prove "standard" is rejected without one).

test('room:create with mode "standard" is rejected when no verifyLoadout is configured', async () => {
  await withServer({}, async ({ connect }) => {
    const socket = await connect();
    const res = await emit(socket, "room:create", { nickname: "Host", mode: "standard" });
    assert.equal(res.ok, false);
    if (res.ok) throw new Error("unreachable");
    assert.match(res.error, /chain/i);
  });
});

test('room:create with mode "standard" succeeds when a verifyLoadout is configured, and defaults to "casual" otherwise', async () => {
  const verifyLoadout: LoadoutVerifier = async () => ({ valid: true });
  await withServer({ verifyLoadout }, async ({ connect }) => {
    const socket = await connect();

    const standardRes = await emit(socket, "room:create", { nickname: "Host", mode: "standard" });
    assert.equal(standardRes.ok, true);
    if (!standardRes.ok) throw new Error("unreachable");
    assert.equal((standardRes.view as { mode: string }).mode, "standard");

    const casualSocket = await connect();
    const casualRes = await emit(casualSocket, "room:create", { nickname: "Host2" });
    assert.equal(casualRes.ok, true);
    if (!casualRes.ok) throw new Error("unreachable");
    assert.equal((casualRes.view as { mode: string }).mode, "casual");
  });
});

test("loadout:set succeeds against a mock verifier and is broadcast (publicly) to every player in the room", async () => {
  const verifyLoadout: LoadoutVerifier = async (_owner, skillIds) => {
    assert.deepEqual(skillIds, [1, 2]);
    return { valid: true };
  };

  await withServer({ verifyLoadout }, async ({ connect }) => {
    const host = await connect();
    const guest = await connect();
    const account = privateKeyToAccount(generatePrivateKey());

    await linkWallet(host, account);
    const created = await emit(host, "room:create", { nickname: "Host", mode: "standard" });
    assert.equal(created.ok, true);
    if (!created.ok) throw new Error("unreachable");
    const code = created.code as string;

    // Drain the join-triggered room:state broadcast before attaching the
    // listener for the loadout:set one - see the identical comment in the
    // wallet:link-after-joining test above.
    const joinBroadcast = waitForEvent(guest, "room:state");
    await emit(guest, "room:join", { code, nickname: "Guest" });
    await joinBroadcast;

    const guestRoomState = waitForEvent<{ players: { playerId: string; loadout?: number[] }[] }>(
      guest,
      "room:state",
    );
    const setRes = await emit(host, "loadout:set", { skillIds: [1, 2] });
    assert.equal(setRes.ok, true, `expected success, got: ${JSON.stringify(setRes)}`);
    if (!setRes.ok) throw new Error("unreachable");
    const hostPlayerId = created.playerId as string;
    const setView = setRes.view as { players: { playerId: string; loadout?: number[] }[] };
    assert.deepEqual(setView.players.find((p) => p.playerId === hostPlayerId)?.loadout, [1, 2]);

    // The guest (who never set a loadout) also sees the host's picks - public by design.
    const guestState = await guestRoomState;
    assert.deepEqual(guestState.players.find((p) => p.playerId === hostPlayerId)?.loadout, [1, 2]);
  });
});

test("loadout:set is rejected in a casual room", async () => {
  const verifyLoadout: LoadoutVerifier = async () => ({ valid: true });
  await withServer({ verifyLoadout }, async ({ connect }) => {
    const socket = await connect();
    const account = privateKeyToAccount(generatePrivateKey());
    await linkWallet(socket, account);
    await emit(socket, "room:create", { nickname: "Host" }); // mode defaults to "casual"

    const res = await emit(socket, "loadout:set", { skillIds: [1] });
    assert.equal(res.ok, false);
    if (res.ok) throw new Error("unreachable");
    assert.match(res.error, /standard/i);
  });
});

test("loadout:set is rejected without a linked wallet", async () => {
  const verifyLoadout: LoadoutVerifier = async () => ({ valid: true });
  await withServer({ verifyLoadout }, async ({ connect }) => {
    const socket = await connect();
    await emit(socket, "room:create", { nickname: "Host", mode: "standard" });

    const res = await emit(socket, "loadout:set", { skillIds: [1] });
    assert.equal(res.ok, false);
    if (res.ok) throw new Error("unreachable");
    assert.match(res.error, /wallet/i);
  });
});

test("loadout:set is rejected with more than 2 skillIds", async () => {
  const verifyLoadout: LoadoutVerifier = async () => ({ valid: true });
  await withServer({ verifyLoadout }, async ({ connect }) => {
    const socket = await connect();
    const account = privateKeyToAccount(generatePrivateKey());
    await linkWallet(socket, account);
    await emit(socket, "room:create", { nickname: "Host", mode: "standard" });

    const res = await emit(socket, "loadout:set", { skillIds: [1, 2, 3] });
    assert.equal(res.ok, false);
    if (res.ok) throw new Error("unreachable");
    assert.match(res.error, /at most 2/i);
  });
});

test("loadout:set surfaces the chain verifier's rejection reason", async () => {
  const verifyLoadout: LoadoutVerifier = async () => ({ valid: false, reason: "Skill 9 is not owned by this address" });
  await withServer({ verifyLoadout }, async ({ connect }) => {
    const socket = await connect();
    const account = privateKeyToAccount(generatePrivateKey());
    await linkWallet(socket, account);
    await emit(socket, "room:create", { nickname: "Host", mode: "standard" });

    const res = await emit(socket, "loadout:set", { skillIds: [9] });
    assert.equal(res.ok, false);
    if (res.ok) throw new Error("unreachable");
    assert.equal(res.error, "Skill 9 is not owned by this address");
  });
});

test("loadout:set is rejected once the match has started (playing phase)", async () => {
  const verifyLoadout: LoadoutVerifier = async () => ({ valid: true });
  await withServer({ verifyLoadout }, async ({ connect }) => {
    const host = await connect();
    const guest = await connect();
    const account = privateKeyToAccount(generatePrivateKey());
    await linkWallet(host, account);

    const created = await emit(host, "room:create", { nickname: "Host", mode: "standard" });
    assert.equal(created.ok, true);
    if (!created.ok) throw new Error("unreachable");
    const code = created.code as string;
    await emit(guest, "room:join", { code, nickname: "Guest" });

    await emit(host, "loadout:set", { skillIds: [1] });
    await emit(host, "draft:start", {});
    await emit(host, "draft:submit", { numbers: identityBoard() });
    await emit(guest, "draft:submit", { numbers: shiftedBoard() });

    const res = await emit(host, "loadout:set", { skillIds: [2] });
    assert.equal(res.ok, false);
    if (res.ok) throw new Error("unreachable");
    assert.match(res.error, /phase/i);
  });
});

test("a player without a loadout can still draft and play a full match in a standard room", async () => {
  const verifyLoadout: LoadoutVerifier = async () => ({ valid: true });
  await withServer({ verifyLoadout }, async ({ connect }) => {
    const host = await connect();
    const guest = await connect();
    const account = privateKeyToAccount(generatePrivateKey());
    await linkWallet(host, account);

    const created = await emit(host, "room:create", { nickname: "Host", mode: "standard" });
    assert.equal(created.ok, true);
    if (!created.ok) throw new Error("unreachable");
    const code = created.code as string;
    await emit(guest, "room:join", { code, nickname: "Guest" }); // guest: no wallet, no loadout

    await emit(host, "loadout:set", { skillIds: [1] });
    await emit(host, "draft:start", {});
    const hostSubmit = await emit(host, "draft:submit", { numbers: identityBoard() });
    assert.equal(hostSubmit.ok, true);
    const guestSubmit = await emit(guest, "draft:submit", { numbers: shiftedBoard() });
    assert.equal(guestSubmit.ok, true, "player without a loadout must still be able to submit a board and play");

    const callRes = await emit(host, "match:call", { number: 1 });
    assert.equal(callRes.ok, true);
  });
});

// -- skills (in-match) ------------------------------------------------------
//
// A "standard" room with a mock resolveLoadout (skillId -> SkillInstance,
// see rooms.ts's submitBoard/SubmitBoardOptions and CLAUDE.md step 1) so a
// match actually starts with real skill charges attached, then drives
// skill:use/skill:respond over the socket the same way a browser client
// would. skillId 1 -> WILD_DAUB, skillId 2 -> NULLIFY.

const SKILL_CATALOG: Record<number, SkillInstance> = {
  1: { effectType: WILD_DAUB, chargesLeft: 2 },
  2: { effectType: NULLIFY, chargesLeft: 1 },
};

const mockResolveLoadout = async (skillIds: readonly number[]): Promise<SkillInstance[]> =>
  skillIds.map((id) => SKILL_CATALOG[id]!);

interface SkillMatchSetup {
  readonly host: ClientSocket;
  readonly guest: ClientSocket;
  readonly hostId: string;
  readonly guestId: string;
}

/**
 * A "standard" mode 2-player match already through draft: host holds
 * `hostSkillIds`, guest holds `guestSkillIds` (both resolved through
 * mockResolveLoadout above). Boards are identityBoard (host) / shiftedBoard
 * (guest) - same as setupTwoPlayerMatch, so calling 1..20 alternately
 * (host on odds, guest on evens) leaves both players just short of 5 lines,
 * same math the win-via-skill test below relies on.
 */
async function setupStandardSkillMatch(
  connect: () => Promise<ClientSocket>,
  hostSkillIds: readonly number[],
  guestSkillIds: readonly number[],
): Promise<SkillMatchSetup> {
  const host = await connect();
  const guest = await connect();

  await linkWallet(host, privateKeyToAccount(generatePrivateKey()));
  await linkWallet(guest, privateKeyToAccount(generatePrivateKey()));

  const created = await emit(host, "room:create", { nickname: "Host", mode: "standard" });
  assert.equal(created.ok, true);
  if (!created.ok) throw new Error("unreachable");
  const code = created.code as string;
  const hostId = created.playerId as string;

  const joined = await emit(guest, "room:join", { code, nickname: "Guest" });
  assert.equal(joined.ok, true);
  if (!joined.ok) throw new Error("unreachable");
  const guestId = joined.playerId as string;

  if (hostSkillIds.length > 0) {
    const res = await emit(host, "loadout:set", { skillIds: hostSkillIds });
    assert.equal(res.ok, true, `host loadout:set should succeed: ${JSON.stringify(res)}`);
  }
  if (guestSkillIds.length > 0) {
    const res = await emit(guest, "loadout:set", { skillIds: guestSkillIds });
    assert.equal(res.ok, true, `guest loadout:set should succeed: ${JSON.stringify(res)}`);
  }

  await emit(host, "draft:start", {});
  const hostSubmit = await emit(host, "draft:submit", { numbers: identityBoard() });
  assert.equal(hostSubmit.ok, true);
  const guestSubmit = await emit(guest, "draft:submit", { numbers: shiftedBoard() });
  assert.equal(guestSubmit.ok, true);

  return { host, guest, hostId, guestId };
}

test("skill:use WILD_DAUB resolves immediately when no opponent holds NULLIFY, and never leaks into the opponent's match:state", async () => {
  const verifyLoadout: LoadoutVerifier = async () => ({ valid: true });
  await withServer({ verifyLoadout, resolveLoadout: mockResolveLoadout }, async ({ connect }) => {
    const { host, guest, hostId } = await setupStandardSkillMatch(connect, [1], []); // guest: no loadout at all

    // Attached before triggering skill:use, so it can't miss the broadcast - see setupTwoPlayerMatch's comment.
    const guestMatchState = waitForEvent<{ daubedCells?: number[]; players: Record<string, unknown>[] }>(
      guest,
      "match:state",
    );
    const resolvedPromise = waitForEvent<{ playerId: string; effectType: string; nullified: boolean }>(
      host,
      "skill:resolved",
    );

    const useRes = await emit(host, "skill:use", { effectType: WILD_DAUB, args: { cellIndex: 0 } });
    assert.equal(useRes.ok, true, `expected success, got: ${JSON.stringify(useRes)}`);
    if (!useRes.ok) throw new Error("unreachable");
    const hostView = useRes.view as { daubedCells?: number[]; pendingSkill?: unknown };
    assert.deepEqual(hostView.daubedCells, [0]);
    assert.equal(hostView.pendingSkill, undefined, "no Nullify-capable opponent - resolves immediately");

    const resolved = await resolvedPromise;
    assert.deepEqual(resolved, { playerId: hostId, effectType: WILD_DAUB, nullified: false });

    const guestView = await guestMatchState;
    assert.ok(
      guestView.daubedCells === undefined || guestView.daubedCells.length === 0,
      "guest's OWN daubedCells is empty - they never used Wild Daub",
    );
    for (const player of guestView.players) {
      assert.equal("daubedCells" in player, false, "opponents' daubedCells must never appear in players[]");
      assert.equal("ghostNumbers" in player, false, "opponents' ghostNumbers must never appear in players[]");
    }
  });
});

test("skill:use opens a Nullify window when an opponent holds NULLIFY; skill:respond nullify:true cancels it", async () => {
  const verifyLoadout: LoadoutVerifier = async () => ({ valid: true });
  await withServer({ verifyLoadout, resolveLoadout: mockResolveLoadout }, async ({ connect }) => {
    const { host, guest, hostId, guestId } = await setupStandardSkillMatch(connect, [1], [2]);

    // Persistent (not `.once`) collector attached before skill:use, so it
    // can't race against that first broadcast (pendingSkill set) still
    // being in flight when we'd otherwise attach a fresh listener right
    // before skill:respond - see the timeout test's comment for the same
    // hazard. Reading the LAST entry once skill:resolved has fired always
    // reflects skill:respond's own resolution, not the earlier one.
    const hostMatchStates: { daubedCells?: number[]; pendingSkill?: unknown }[] = [];
    host.on("match:state", (view: { daubedCells?: number[]; pendingSkill?: unknown }) => hostMatchStates.push(view));
    const pendingPromise = waitForEvent<{ playerId: string; effectType: string; awaiting: string[] }>(
      guest,
      "skill:pending",
    );

    const useRes = await emit(host, "skill:use", { effectType: WILD_DAUB, args: { cellIndex: 0 } });
    assert.equal(useRes.ok, true);
    if (!useRes.ok) throw new Error("unreachable");
    const hostViewAfterUse = useRes.view as {
      pendingSkill?: { playerId: string; effectType: string; awaiting: string[] };
    };
    assert.deepEqual(hostViewAfterUse.pendingSkill, { playerId: hostId, effectType: WILD_DAUB, awaiting: [guestId] });

    const pending = await pendingPromise;
    assert.deepEqual(pending, { playerId: hostId, effectType: WILD_DAUB, awaiting: [guestId] });

    const resolvedPromise = waitForEvent<{
      playerId: string;
      effectType: string;
      nullified: boolean;
      nullifiedBy?: string;
    }>(host, "skill:resolved");
    const respondRes = await emit(guest, "skill:respond", { nullify: true });
    assert.equal(respondRes.ok, true, `expected success, got: ${JSON.stringify(respondRes)}`);

    const resolved = await resolvedPromise;
    assert.deepEqual(resolved, { playerId: hostId, effectType: WILD_DAUB, nullified: true, nullifiedBy: guestId });

    const lastHostState = hostMatchStates.at(-1);
    assert.ok(lastHostState, "host should have received at least one match:state broadcast");
    assert.equal(lastHostState!.pendingSkill, undefined);
    assert.ok(
      lastHostState!.daubedCells === undefined || lastHostState!.daubedCells.length === 0,
      "the daub never applied",
    );
  });
});

test("skill:respond nullify:false (pass) resolves the pending skill normally once every awaiting opponent has answered", async () => {
  const verifyLoadout: LoadoutVerifier = async () => ({ valid: true });
  await withServer({ verifyLoadout, resolveLoadout: mockResolveLoadout }, async ({ connect }) => {
    const { host, guest, hostId } = await setupStandardSkillMatch(connect, [1], [2]);

    // Same persistent-collector reasoning as the test above. skill:resolved
    // is awaited on `host` too (not `guest`) so it's on the SAME connection
    // as the match:state collector - events on one connection are strictly
    // ordered, so by the time host sees skill:resolved it has necessarily
    // already seen the match:state that preceded it. Awaiting it via guest's
    // connection instead would have no such guarantee (different socket,
    // no cross-connection ordering) and could read a stale hostMatchStates
    // entry.
    const hostMatchStates: { daubedCells?: number[]; pendingSkill?: unknown }[] = [];
    host.on("match:state", (view: { daubedCells?: number[]; pendingSkill?: unknown }) => hostMatchStates.push(view));

    const useRes = await emit(host, "skill:use", { effectType: WILD_DAUB, args: { cellIndex: 0 } });
    assert.equal(useRes.ok, true);
    if (!useRes.ok) throw new Error("unreachable");
    assert.ok((useRes.view as { pendingSkill?: unknown }).pendingSkill, "expected a Nullify window to open");

    const resolvedPromise = waitForEvent<{ playerId: string; effectType: string; nullified: boolean }>(
      host,
      "skill:resolved",
    );
    const respondRes = await emit(guest, "skill:respond", { nullify: false });
    assert.equal(respondRes.ok, true, `expected success, got: ${JSON.stringify(respondRes)}`);

    const resolved = await resolvedPromise;
    assert.deepEqual(resolved, { playerId: hostId, effectType: WILD_DAUB, nullified: false });

    const lastHostState = hostMatchStates.at(-1);
    assert.ok(lastHostState, "host should have received at least one match:state broadcast");
    assert.equal(lastHostState!.pendingSkill, undefined);
    assert.deepEqual(lastHostState!.daubedCells, [0], "passing let the daub through");
  });
});

test("an unanswered Nullify window auto-passes once nullifyTimeoutMs elapses, resolving the skill without the awaiting opponent ever responding", async () => {
  const verifyLoadout: LoadoutVerifier = async () => ({ valid: true });
  await withServer(
    { verifyLoadout, resolveLoadout: mockResolveLoadout, nullifyTimeoutMs: 50 },
    async ({ connect }) => {
      const { host, guest, hostId } = await setupStandardSkillMatch(connect, [1], [2]);

      // Persistent (not `.once`) collectors, attached before triggering
      // skill:use - skill:use itself already causes one match:state
      // broadcast (pendingSkill set, not yet resolved) before the timeout's
      // own one arrives, so a `.once` listener attached only after the ack
      // could race and grab the wrong one (see setupTwoPlayerMatch's
      // comment on this exact hazard). Collecting everything and reading
      // the LAST entry once skill:resolved has fired sidesteps the race -
      // skill:resolved is awaited on `host` (same connection as the
      // collector) rather than `guest`, since only same-connection delivery
      // order is guaranteed (see the "pass" test's identical comment).
      const hostMatchStates: { daubedCells?: number[]; pendingSkill?: unknown }[] = [];
      host.on("match:state", (view: { daubedCells?: number[]; pendingSkill?: unknown }) =>
        hostMatchStates.push(view),
      );
      const resolvedPromise = waitForEvent<{ playerId: string; effectType: string; nullified: boolean }>(
        host,
        "skill:resolved",
      );

      const useRes = await emit(host, "skill:use", { effectType: WILD_DAUB, args: { cellIndex: 0 } });
      assert.equal(useRes.ok, true);
      if (!useRes.ok) throw new Error("unreachable");
      assert.ok((useRes.view as { pendingSkill?: unknown }).pendingSkill, "expected a Nullify window to open");

      // guest deliberately never calls skill:respond - only the server-side timer should resolve this.
      const resolved = await resolvedPromise;
      assert.deepEqual(resolved, { playerId: hostId, effectType: WILD_DAUB, nullified: false });

      const lastHostState = hostMatchStates.at(-1);
      assert.ok(lastHostState, "host should have received at least one match:state broadcast");
      assert.equal(lastHostState!.pendingSkill, undefined);
      assert.deepEqual(lastHostState!.daubedCells, [0]);
    },
  );
});

test("winning via a skill (Wild Daub completing the 5th line) still emits match:ended and the daily_win_1_match quest event", async () => {
  const verifyLoadout: LoadoutVerifier = async () => ({ valid: true });
  await withServer({ verifyLoadout, resolveLoadout: mockResolveLoadout }, async ({ connect }) => {
    const { host, guest, hostId } = await setupStandardSkillMatch(connect, [1], []);
    const dailyWinQuest = exampleQuests.find((q) => q.id === "daily_win_1_match");
    assert.ok(dailyWinQuest, "exampleQuests must define daily_win_1_match");

    // Same call sequence/board pair as engine/skills.test.ts's "WILD_DAUB
    // completes the 5th line and wins immediately" test: identityBoard (host)
    // vs shiftedBoard (guest), 1..20 alternating leaves host with exactly 4
    // completed lines and back on their own turn - Wild Daub on index 20
    // (holds "21") completes the 5th (column0 + anti-diagonal) without ever
    // calling 21.
    for (let n = 1; n <= 20; n++) {
      const caller = n % 2 === 1 ? host : guest;
      const result = await emit(caller, "match:call", { number: n });
      assert.equal(result.ok, true, `call ${n} should succeed`);
    }

    const questsCompleted: { questId: string; title: string }[] = [];
    host.on("quest:completed", (payload: { questId: string; title: string }) => questsCompleted.push(payload));

    const matchEnded = waitForEvent<{ winnerId: string | null }>(host, "match:ended");
    const useRes = await emit(host, "skill:use", { effectType: WILD_DAUB, args: { cellIndex: 20 } });
    assert.equal(useRes.ok, true, `expected success, got: ${JSON.stringify(useRes)}`);
    if (!useRes.ok) throw new Error("unreachable");
    const finalView = useRes.view as { status: string; winnerId?: string };
    assert.equal(finalView.status, "finished");
    assert.equal(finalView.winnerId, hostId);

    const endedPayload = await matchEnded;
    assert.equal(endedPayload.winnerId, hostId);

    const winQuestPayload = questsCompleted.find((q) => q.questId === dailyWinQuest!.id);
    assert.ok(
      winQuestPayload,
      `expected a quest:completed for ${dailyWinQuest!.id}, got: ${JSON.stringify(questsCompleted)}`,
    );
  });
});

// -- plaza (global chat, CONCEPT.md §7.4b) -------------------------------
//
// Global and unauthenticated (guest play works, CLAUDE.md) - no room:create
// or wallet:link needed, unlike everything above. Pure validation/rate-limit
// logic is unit tested directly in plaza/plaza.test.ts; this section only
// exercises the transport: broadcast fan-out, ack shape, boundary rejects.

test("plaza:send broadcasts plaza:message to every connected socket, including the sender", async () => {
  const a = await connectClient();
  const b = await connectClient();

  const aMsg = waitForEvent<Record<string, unknown>>(a, "plaza:message");
  const bMsg = waitForEvent<Record<string, unknown>>(b, "plaza:message");

  const res = await emit(a, "plaza:send", { nickname: "Alice", text: "gm plaza" });
  assert.equal(res.ok, true);
  if (!res.ok) throw new Error("unreachable");
  const sentMessage = res.message as { nickname: string; text: string; id: string };
  assert.equal(sentMessage.nickname, "Alice");
  assert.equal(sentMessage.text, "gm plaza");
  assert.equal(typeof sentMessage.id, "string");

  assert.deepEqual(await aMsg, sentMessage);
  assert.deepEqual(await bMsg, sentMessage);
});

test("plaza:send accepts an optional skillId, attached to the broadcast message", async () => {
  const a = await connectClient();
  const res = await emit(a, "plaza:send", { nickname: "Alice", text: "check my skill", skillId: 3 });
  assert.equal(res.ok, true);
  if (!res.ok) throw new Error("unreachable");
  assert.equal((res.message as { skillId?: number }).skillId, 3);
});

test("plaza:history returns messages already sent, oldest -> newest", async () => {
  const a = await connectClient();
  const b = await connectClient(); // separate socket - avoids the 2s rate limit for the second send

  const firstRes = await emit(a, "plaza:send", { nickname: "Alice", text: "first" });
  const secondRes = await emit(b, "plaza:send", { nickname: "Bob", text: "second" });
  assert.equal(firstRes.ok, true);
  assert.equal(secondRes.ok, true);

  const historyRes = await emit(a, "plaza:history", {});
  assert.equal(historyRes.ok, true);
  if (!historyRes.ok) throw new Error("unreachable");
  const texts = (historyRes.messages as { text: string }[]).map((m) => m.text);
  assert.deepEqual(texts, ["first", "second"]);
});

test("plaza:send rejects an empty text", async () => {
  const a = await connectClient();
  const res = await emit(a, "plaza:send", { nickname: "Alice", text: "" });
  assert.equal(res.ok, false);
});

test("plaza:send rejects text longer than 280 characters", async () => {
  const a = await connectClient();
  const res = await emit(a, "plaza:send", { nickname: "Alice", text: "x".repeat(281) });
  assert.equal(res.ok, false);
});

test("plaza:send rejects a nickname longer than 24 characters", async () => {
  const a = await connectClient();
  const res = await emit(a, "plaza:send", { nickname: "x".repeat(25), text: "hi" });
  assert.equal(res.ok, false);
});

test("plaza:send rejects an invalid skillId", async () => {
  const a = await connectClient();
  const res = await emit(a, "plaza:send", { nickname: "Alice", text: "hi", skillId: -1 });
  assert.equal(res.ok, false);
});

test("plaza:send is rate limited to 1 message per 2s per socket", async () => {
  const a = await connectClient();
  const first = await emit(a, "plaza:send", { nickname: "Alice", text: "one" });
  assert.equal(first.ok, true);

  const second = await emit(a, "plaza:send", { nickname: "Alice", text: "two" });
  assert.equal(second.ok, false);
  if (second.ok) throw new Error("unreachable");
  assert.match(second.error, /rate limit/i);
});

test("plaza:send rate limit is per socket, not global", async () => {
  const a = await connectClient();
  const b = await connectClient();
  const first = await emit(a, "plaza:send", { nickname: "Alice", text: "one" });
  const fromOther = await emit(b, "plaza:send", { nickname: "Bob", text: "hi" });
  assert.equal(first.ok, true);
  assert.equal(fromOther.ok, true);
});

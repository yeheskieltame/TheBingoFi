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

import { BOARD_SIZE } from "../engine/index.ts";
import { exampleQuests } from "../quest/index.ts";
import { createRealtimeServer } from "./server.ts";

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

test("a 9th join to an already-full (8-player) room returns an ack error", async () => {
  const host = await connectClient();
  const created = await emit(host, "room:create", { nickname: "Host" });
  assert.equal(created.ok, true);
  if (!created.ok) throw new Error("unreachable");
  const code = created.code as string;

  // 7 more joins fill the room to MAX_PLAYERS (8).
  for (let i = 0; i < 7; i++) {
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

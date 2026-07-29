import { io, type Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "@thebingofi/server/protocol";

/**
 * Typed Socket.IO client, see server/API.md "Connect". Generic order on the
 * client is `Socket<ListenEvents, EmitEvents>` - the REVERSE of the
 * server's `Server<ClientToServerEvents, ServerToClientEvents>` - because
 * the client *listens for* ServerToClientEvents and *emits*
 * ClientToServerEvents.
 */
export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3001";

let socket: AppSocket | undefined;

/**
 * Lazily creates (once per browser tab) and returns the app-wide socket
 * singleton. Created with `autoConnect: false` - callers (hooks/useRoom.ts)
 * decide when to connect/disconnect, since only /play needs a live socket.
 */
export function getSocket(): AppSocket {
  if (!socket) {
    socket = io(SERVER_URL, { autoConnect: false });
  }
  return socket;
}

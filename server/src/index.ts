/**
 * Backend entrypoint.
 *
 * Boots the realtime server (Socket.IO room/matchmaking/guest-play layer,
 * see server/src/realtime/) on a plain node:http server. The pure game
 * engine, daily challenge, and quest modules are re-exported for consumers
 * that want the library surface without running a server (e.g. tests,
 * future tooling).
 */
import { createServer } from "node:http";
import { createRealtimeServer } from "./realtime/server.ts";

export * from "./engine/index.ts";
export * from "./daily/index.ts";
export * from "./quest/index.ts";

// Boot hanya saat dijalankan langsung (node src/index.ts), bukan saat di-import sebagai lib.
if (import.meta.main) {
  const PORT = Number(process.env.PORT ?? 3001);
  const httpServer = createServer();
  createRealtimeServer(httpServer);
  httpServer.listen(PORT, () => {
    console.log(`TheBingoFi realtime server ready on :${PORT}`);
  });
}

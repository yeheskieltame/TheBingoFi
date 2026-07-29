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
import { createHttpHandler } from "./api/http.ts";
import { createDefaultLoadoutVerifier } from "./chain/defaultVerifier.ts";
import { createRealtimeServer } from "./realtime/server.ts";

export * from "./engine/index.ts";
export * from "./daily/index.ts";
export * from "./quest/index.ts";
export type * from "./api/protocol.ts";

// Boot hanya saat dijalankan langsung (node src/index.ts), bukan saat di-import sebagai lib.
if (import.meta.main) {
  const PORT = Number(process.env.PORT ?? 3001);
  const httpServer = createServer(createHttpHandler());
  // DI wiring: the realtime layer never builds a viem client itself (see
  // realtime/server.ts's LoadoutVerifier / RealtimeServerOptions) - this is
  // the one spot that resolves the real one (env vars, falling back to
  // contracts/deployments/91342.json) and hands it in. Undefined here
  // (chain not configured) means "standard" mode rooms are rejected with a
  // clear error rather than the server failing to boot.
  const verifyLoadout = createDefaultLoadoutVerifier();
  if (!verifyLoadout) {
    console.warn(
      'Chain belum dikonfigurasi (REGISTRY_ADDRESS/COLLECTION_ADDRESS/contracts/deployments/91342.json) - mode "standard" tidak tersedia.',
    );
  }
  createRealtimeServer(httpServer, { verifyLoadout });
  httpServer.listen(PORT, () => {
    console.log(`TheBingoFi realtime server ready on :${PORT}`);
  });
}

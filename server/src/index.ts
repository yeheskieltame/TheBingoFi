/**
 * Backend entrypoint.
 *
 * Boots the realtime server (Socket.IO room/matchmaking/guest-play layer,
 * see server/src/realtime/) on a plain node:http server. The pure game
 * engine, daily challenge, and quest modules are re-exported for consumers
 * that want the library surface without running a server (e.g. tests,
 * future tooling).
 */
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Address } from "viem";

import { createHttpHandler } from "./api/http.ts";
import { createChainClient, loadChainConfig } from "./chain/config.ts";
import { createDefaultLoadoutVerifier } from "./chain/defaultVerifier.ts";
import { getCatalog, type SkillDef } from "./chain/reader.ts";
import type { SkillInstance } from "./engine/index.ts";
import { createRealtimeServer } from "./realtime/server.ts";

export * from "./engine/index.ts";
export * from "./daily/index.ts";
export * from "./quest/index.ts";
export type * from "./api/protocol.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
/** server/src -> repo root is 2 levels up. */
const DEFAULT_DEPLOYMENTS_PATH = path.resolve(HERE, "../../contracts/deployments/91342.json");

interface DeploymentsManifest {
  readonly contracts?: { readonly SkillRegistry?: string };
}

/**
 * Resolves just the SkillRegistry address (REGISTRY_ADDRESS env var, else
 * contracts/deployments/91342.json) - the ONE thing createDefaultLoadoutResolver
 * below needs from chain config. Mirrors chain/defaultVerifier.ts's own
 * address resolution (env vars, falling back to the deployments file);
 * duplicated narrowly here (registry only, no collection address) rather
 * than exported from there, to keep that module's surface focused on
 * building a LoadoutVerifier.
 */
function resolveRegistryAddress(env: NodeJS.ProcessEnv, deploymentsPath: string): Address | undefined {
  const envAddress = env.REGISTRY_ADDRESS;
  if (envAddress && envAddress.length > 0) return envAddress as Address;
  if (!existsSync(deploymentsPath)) return undefined;
  try {
    const manifest = JSON.parse(readFileSync(deploymentsPath, "utf8")) as DeploymentsManifest;
    const address = manifest.contracts?.SkillRegistry;
    return address ? (address as Address) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Builds the production `resolveLoadout` (see realtime/server.ts's
 * RealtimeServerOptions): given verified skillIds (already checked by
 * loadout:set's verifyLoadout), fetches each skill's effectType + charges
 * from the on-chain registry and returns fresh SkillInstance[] for
 * createMatch (CLAUDE.md step 1). Returns undefined when the registry isn't
 * configured (same "chain belum dikonfigurasi" situation as
 * createDefaultLoadoutVerifier) - rooms.ts's submitBoard treats that as
 * "start with no skills" rather than failing match start outright. The
 * catalog is fetched once and cached module-level (skills are added
 * rarely - SkillFactory.createSkill is a one-off data call, see CLAUDE.md)
 * instead of refetched per match.
 */
function createDefaultLoadoutResolver(
  env: NodeJS.ProcessEnv = process.env,
  deploymentsPath: string = DEFAULT_DEPLOYMENTS_PATH,
): ((skillIds: readonly number[]) => Promise<SkillInstance[]>) | undefined {
  const registryAddress = resolveRegistryAddress(env, deploymentsPath);
  if (!registryAddress) return undefined;

  const cfg = loadChainConfig(env);
  const client = createChainClient({ rpcUrl: cfg.rpcUrl });
  let catalogPromise: Promise<SkillDef[]> | undefined;
  const catalog = (): Promise<SkillDef[]> => (catalogPromise ??= getCatalog(client, registryAddress));

  return async (skillIds) => {
    const defs = await catalog();
    const byId = new Map(defs.map((def) => [def.skillId, def] as const));
    return skillIds.map((id) => {
      const def = byId.get(id);
      return { effectType: def?.effectType ?? "", chargesLeft: def?.charges ?? 0 };
    });
  };
}

// Boot hanya saat dijalankan langsung (node src/index.ts), bukan saat di-import sebagai lib.
if (import.meta.main) {
  const PORT = Number(process.env.PORT ?? 3001);
  const httpServer = createServer(createHttpHandler());
  // DI wiring: the realtime layer never builds a viem client itself (see
  // realtime/server.ts's LoadoutVerifier/resolveLoadout / RealtimeServerOptions)
  // - this is the one spot that resolves the real ones (env vars, falling
  // back to contracts/deployments/91342.json) and hands them in. Undefined
  // here (chain not configured) means "standard" mode rooms are rejected
  // with a clear error rather than the server failing to boot.
  const verifyLoadout = createDefaultLoadoutVerifier();
  if (!verifyLoadout) {
    console.warn(
      'Chain belum dikonfigurasi (REGISTRY_ADDRESS/COLLECTION_ADDRESS/contracts/deployments/91342.json) - mode "standard" tidak tersedia.',
    );
  }
  const resolveLoadout = createDefaultLoadoutResolver();
  createRealtimeServer(httpServer, { verifyLoadout, resolveLoadout });
  httpServer.listen(PORT, () => {
    console.log(`TheBingoFi realtime server ready on :${PORT}`);
  });
}

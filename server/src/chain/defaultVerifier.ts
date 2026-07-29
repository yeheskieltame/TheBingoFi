/**
 * Builds the production `LoadoutVerifier` (see realtime/server.ts) that
 * index.ts wires into `createRealtimeServer`. This is the ONE place in
 * server/ that decides where the real Registry/Collection addresses come
 * from and constructs a real viem client - the realtime layer itself never
 * does either (dependency injection, see realtime/server.ts's
 * RealtimeServerOptions), which is what keeps rooms.ts/server.ts testable
 * without a chain.
 *
 * Resolution order, mirroring CLAUDE.md's "chain/config.ts":
 *  1. REGISTRY_ADDRESS + COLLECTION_ADDRESS env vars, if both set.
 *  2. Otherwise, contracts/deployments/91342.json at the repo root, if it
 *     exists (this is how a fresh checkout works against the already-live
 *     GIWA Sepolia deployment without any env setup - see CLAUDE.md's
 *     "Kontrak sudah live di GIWA Sepolia").
 *  3. Otherwise, undefined - "chain belum dikonfigurasi". Callers (see
 *     realtime/server.ts's room:create/loadout:set) treat that as "standard"
 *     mode rooms being unavailable, with a clear error rather than a crash.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Address } from "viem";

import { createChainClient, loadChainConfig } from "./config.ts";
import { verifyLoadout, type LoadoutVerification } from "./reader.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
/** server/src/chain -> repo root is 3 levels up. */
const DEFAULT_DEPLOYMENTS_PATH = path.resolve(HERE, "../../../contracts/deployments/91342.json");
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

interface DeploymentsManifest {
  readonly contracts?: {
    readonly SkillRegistry?: string;
    readonly SkillCollection?: string;
  };
}

interface ResolvedAddresses {
  readonly registryAddress: Address;
  readonly collectionAddress: Address;
}

/** Reads {contracts: {SkillRegistry, SkillCollection}} from a deployments manifest, or undefined if missing/incomplete/unparseable. */
function readDeploymentsAddresses(deploymentsPath: string): ResolvedAddresses | undefined {
  if (!existsSync(deploymentsPath)) return undefined;
  try {
    const manifest = JSON.parse(readFileSync(deploymentsPath, "utf8")) as DeploymentsManifest;
    const registryAddress = manifest.contracts?.SkillRegistry;
    const collectionAddress = manifest.contracts?.SkillCollection;
    if (!registryAddress || !collectionAddress) return undefined;
    return { registryAddress: registryAddress as Address, collectionAddress: collectionAddress as Address };
  } catch {
    return undefined;
  }
}

/**
 * Return type deliberately matches realtime/server.ts's `LoadoutVerifier`
 * structurally (same shape as chain/reader.ts's `verifyLoadout`) without
 * importing it - chain/ has no business depending on realtime/, index.ts is
 * the only place that wires the two together.
 */
export type DefaultLoadoutVerifier = (owner: string, skillIds: readonly number[]) => Promise<LoadoutVerification>;

/**
 * Builds the production LoadoutVerifier, or undefined when chain isn't
 * configured by either env vars or a deployments file. `env` and
 * `deploymentsPath` are overridable (used by defaultVerifier.test.ts) so
 * this never needs a real RPC endpoint to unit test its resolution logic -
 * it only builds a client, it never calls it here.
 */
export function createDefaultLoadoutVerifier(
  env: NodeJS.ProcessEnv = process.env,
  deploymentsPath: string = DEFAULT_DEPLOYMENTS_PATH,
): DefaultLoadoutVerifier | undefined {
  const cfg = loadChainConfig(env);

  const envConfigured = cfg.registryAddress !== ZERO_ADDRESS && cfg.collectionAddress !== ZERO_ADDRESS;
  const resolved: ResolvedAddresses | undefined = envConfigured
    ? { registryAddress: cfg.registryAddress, collectionAddress: cfg.collectionAddress }
    : readDeploymentsAddresses(deploymentsPath);

  if (!resolved) return undefined;

  const client = createChainClient({ rpcUrl: cfg.rpcUrl });
  return (owner, skillIds) => verifyLoadout(client, resolved, owner as Address, skillIds);
}

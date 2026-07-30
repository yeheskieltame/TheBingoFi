/**
 * Builds the production chain-reading functions that index.ts wires into
 * `createRealtimeServer`/`createHttpHandler`: the `LoadoutVerifier` (used by
 * `loadout:set`) and the skill-by-id resolver behind `GET
 * /metadata/:id.json` (see api/http.ts). This is the ONE place in server/
 * that decides where the real Registry/Collection addresses come from and
 * constructs a real viem client - neither the realtime layer nor the HTTP
 * layer does either itself (dependency injection, see realtime/server.ts's
 * RealtimeServerOptions and api/http.ts's HttpHandlerOptions), which is what
 * keeps both testable without a chain.
 *
 * Resolution order, mirroring CLAUDE.md's "chain/config.ts" (shared by both
 * functions below via resolveChainAddresses):
 *  1. REGISTRY_ADDRESS + COLLECTION_ADDRESS env vars, if both set.
 *  2. Otherwise, contracts/deployments/91342.json at the repo root, if it
 *     exists (this is how a fresh checkout works against the already-live
 *     GIWA Sepolia deployment without any env setup - see CLAUDE.md's
 *     "Kontrak sudah live di GIWA Sepolia").
 *  3. Otherwise, undefined - "chain belum dikonfigurasi". Callers (see
 *     realtime/server.ts's room:create/loadout:set and api/http.ts's GET
 *     /metadata/:id.json) treat that as the chain-backed feature being
 *     unavailable, with a clear error rather than a crash.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Address } from "viem";

import { createChainClient, loadChainConfig } from "./config.ts";
import { getSkillById, verifyLoadout, type LoadoutVerification, type SkillDef } from "./reader.ts";

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

export interface ResolvedAddresses {
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
 * Resolves {registryAddress, collectionAddress} - env vars first (both
 * REGISTRY_ADDRESS and COLLECTION_ADDRESS must be set), falling back to the
 * deployments file, else undefined. Extracted so every production call site
 * that needs a real Registry address (currently: createDefaultLoadoutVerifier
 * below, and api/http.ts's metadata endpoint via
 * createDefaultSkillMetadataReader below) resolves it identically instead of
 * duplicating this logic.
 */
export function resolveChainAddresses(
  env: NodeJS.ProcessEnv = process.env,
  deploymentsPath: string = DEFAULT_DEPLOYMENTS_PATH,
): ResolvedAddresses | undefined {
  const cfg = loadChainConfig(env);
  const envConfigured = cfg.registryAddress !== ZERO_ADDRESS && cfg.collectionAddress !== ZERO_ADDRESS;
  if (envConfigured) {
    return { registryAddress: cfg.registryAddress, collectionAddress: cfg.collectionAddress };
  }
  return readDeploymentsAddresses(deploymentsPath);
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
  const resolved = resolveChainAddresses(env, deploymentsPath);
  if (!resolved) return undefined;

  const cfg = loadChainConfig(env);
  const client = createChainClient({ rpcUrl: cfg.rpcUrl });
  return (owner, skillIds) => verifyLoadout(client, resolved, owner as Address, skillIds);
}

/**
 * Builds the production skill-by-id resolver for `GET /metadata/:id.json`
 * (see api/http.ts's `HttpHandlerOptions.resolveSkill`, wired in from
 * index.ts). Only needs the registry address (metadata doesn't check
 * ownership), resolved the same way as createDefaultLoadoutVerifier above.
 * Returns undefined when chain isn't configured - api/http.ts turns that
 * into a 503 rather than touching a real client.
 */
export function createDefaultSkillMetadataReader(
  env: NodeJS.ProcessEnv = process.env,
  deploymentsPath: string = DEFAULT_DEPLOYMENTS_PATH,
): ((skillId: number) => Promise<SkillDef | undefined>) | undefined {
  const resolved = resolveChainAddresses(env, deploymentsPath);
  if (!resolved) return undefined;

  const cfg = loadChainConfig(env);
  const client = createChainClient({ rpcUrl: cfg.rpcUrl });
  return (skillId) => getSkillById(client, resolved.registryAddress, skillId);
}

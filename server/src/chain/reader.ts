/**
 * Read-only chain reader: skill catalog + ownership checks, used to verify
 * a player's loadout against what they actually own on-chain (CLAUDE.md:
 * "verifikasi ownership skill saat matchmaking via read-only RPC/indexer").
 * This module never writes to chain - every function here only ever calls
 * `readContract`.
 *
 * `client` is a thin structural interface rather than viem's full
 * PublicClient, so unit tests can pass a plain `{ readContract: stub }`
 * mock without spinning up a real chain (see reader.test.ts). A real
 * PublicClient (see ./config.ts's createChainClient) also satisfies it,
 * since it has a superset of that shape.
 *
 * Fetching (getCatalog/getOwnedSkillIds) is kept separate from the pure
 * verifyLoadoutPure decision logic so the interesting rules - max 2 skills,
 * ownership, the registry's `active` flag, per-skill maxPerLoadout - can be
 * unit tested with plain data, no client/mock plumbing at all.
 */

import type { Address } from "viem";

import { skillCollectionAbi, skillRegistryAbi } from "./abi.ts";

/** Max skills allowed in a loadout - CLAUDE.md "Max 2 skill per loadout". */
export const MAX_LOADOUT_SIZE = 2;

/** The minimal read surface reader.ts needs - a real viem PublicClient satisfies this. */
export interface ChainReadClient {
  readContract(args: {
    readonly address: Address;
    readonly abi: readonly unknown[];
    readonly functionName: string;
    readonly args?: readonly unknown[];
  }): Promise<unknown>;
}

/** Normalized SkillDef - mirrors contracts/src/SkillRegistry.sol's `struct SkillDef`. */
export interface SkillDef {
  readonly skillId: number;
  readonly effectType: string;
  readonly charges: number;
  readonly cooldown: number;
  readonly maxPerLoadout: number;
  readonly rarity: number;
  readonly active: boolean;
  readonly metadataURI: string;
}

/** Shape decoded off-chain for `getSkill` before normalization - see toSkillDef. */
interface RawSkillDef {
  readonly skillId: bigint | number;
  readonly effectType: string;
  readonly charges: bigint | number;
  readonly cooldown: bigint | number;
  readonly maxPerLoadout: bigint | number;
  readonly rarity: bigint | number;
  readonly active: boolean;
  readonly metadataURI: string;
}

/**
 * Normalizes a raw getSkill struct into SkillDef. viem's ABI decoding maps
 * Solidity uintN outputs to either `number` or `bigint` depending on width;
 * `Number(...)` handles both uniformly, which is safe here since skill ids/
 * charges/cooldowns/rarity are all small values in practice (well under
 * Number.MAX_SAFE_INTEGER).
 */
function toSkillDef(raw: RawSkillDef): SkillDef {
  return {
    skillId: Number(raw.skillId),
    effectType: raw.effectType,
    charges: Number(raw.charges),
    cooldown: Number(raw.cooldown),
    maxPerLoadout: Number(raw.maxPerLoadout),
    rarity: Number(raw.rarity),
    active: raw.active,
    metadataURI: raw.metadataURI,
  };
}

/** Every SkillDef registered in SkillRegistry at `registryAddress`, ids 1..nextSkillId-1. */
export async function getCatalog(client: ChainReadClient, registryAddress: Address): Promise<SkillDef[]> {
  const nextId = Number(
    (await client.readContract({
      address: registryAddress,
      abi: skillRegistryAbi,
      functionName: "nextSkillId",
    })) as bigint | number,
  );

  const ids = Array.from({ length: Math.max(0, nextId - 1) }, (_, index) => index + 1);

  return Promise.all(
    ids.map(async (id) => {
      const raw = (await client.readContract({
        address: registryAddress,
        abi: skillRegistryAbi,
        functionName: "getSkill",
        args: [BigInt(id)],
      })) as RawSkillDef;
      return toSkillDef(raw);
    }),
  );
}

/**
 * Fetches a single skillId's SkillDef, or undefined if it isn't registered.
 * Checks `exists` first rather than calling `getSkill` directly - `getSkill`
 * reverts with `SkillNotFound` for an unregistered id (see
 * contracts/src/SkillRegistry.sol), so this never throws for "not found",
 * only for a genuine RPC/chain error. Used by the metadata endpoint (see
 * api/http.ts's GET /metadata/:id.json) to read one skill without pulling
 * the whole catalog via getCatalog.
 */
export async function getSkillById(
  client: ChainReadClient,
  registryAddress: Address,
  skillId: number,
): Promise<SkillDef | undefined> {
  const exists = (await client.readContract({
    address: registryAddress,
    abi: skillRegistryAbi,
    functionName: "exists",
    args: [BigInt(skillId)],
  })) as boolean;
  if (!exists) return undefined;

  const raw = (await client.readContract({
    address: registryAddress,
    abi: skillRegistryAbi,
    functionName: "getSkill",
    args: [BigInt(skillId)],
  })) as RawSkillDef;
  return toSkillDef(raw);
}

/** Subset of `skillIds` that `owner` holds at least 1 of, via SkillCollection.balanceOfBatch. */
export async function getOwnedSkillIds(
  client: ChainReadClient,
  collectionAddress: Address,
  owner: Address,
  skillIds: readonly number[],
): Promise<number[]> {
  if (skillIds.length === 0) return [];

  const balances = (await client.readContract({
    address: collectionAddress,
    abi: skillCollectionAbi,
    functionName: "balanceOfBatch",
    args: [skillIds.map(() => owner), skillIds.map((id) => BigInt(id))],
  })) as readonly (bigint | number)[];

  return skillIds.filter((_, index) => BigInt(balances[index] ?? 0) > 0n);
}

export interface LoadoutVerification {
  readonly valid: boolean;
  readonly reason?: string;
}

/**
 * Pure loadout validation given an already-fetched catalog + owned-id set:
 *  1. at most MAX_LOADOUT_SIZE skills total (CLAUDE.md: "Max 2 skill per loadout"),
 *  2. every distinct skill in the loadout must exist AND be `active` in the registry,
 *  3. every distinct skill must be owned,
 *  4. a skill repeated within the loadout must not exceed its OWN `maxPerLoadout`.
 * Checked per unique skill id (in loadout order) so `reason` always names
 * the specific offending skill.
 */
export function verifyLoadoutPure(
  catalogById: ReadonlyMap<number, SkillDef>,
  ownedIds: ReadonlySet<number>,
  loadout: readonly number[],
): LoadoutVerification {
  if (loadout.length > MAX_LOADOUT_SIZE) {
    return {
      valid: false,
      reason: `Loadout can contain at most ${MAX_LOADOUT_SIZE} skills, got ${loadout.length}`,
    };
  }

  const counts = new Map<number, number>();
  for (const id of loadout) counts.set(id, (counts.get(id) ?? 0) + 1);

  for (const [id, count] of counts) {
    const def = catalogById.get(id);
    if (!def) return { valid: false, reason: `Skill ${id} does not exist in the registry` };
    if (!def.active) return { valid: false, reason: `Skill ${id} is not active` };
    if (!ownedIds.has(id)) return { valid: false, reason: `Skill ${id} is not owned by this address` };
    if (count > def.maxPerLoadout) {
      return {
        valid: false,
        reason: `Skill ${id} appears ${count}x, exceeding its maxPerLoadout (${def.maxPerLoadout})`,
      };
    }
  }

  return { valid: true };
}

export interface VerifyLoadoutConfig {
  readonly registryAddress: Address;
  readonly collectionAddress: Address;
}

/** Fetches the catalog + this owner's ownership from chain, then applies verifyLoadoutPure. */
export async function verifyLoadout(
  client: ChainReadClient,
  cfg: VerifyLoadoutConfig,
  owner: Address,
  loadout: readonly number[],
): Promise<LoadoutVerification> {
  const uniqueIds = Array.from(new Set(loadout));
  const [catalog, ownedIdList] = await Promise.all([
    getCatalog(client, cfg.registryAddress),
    getOwnedSkillIds(client, cfg.collectionAddress, owner, uniqueIds),
  ]);

  const catalogById = new Map(catalog.map((def) => [def.skillId, def] as const));
  return verifyLoadoutPure(catalogById, new Set(ownedIdList), loadout);
}

import { test } from "node:test";
import assert from "node:assert/strict";
import type { Address } from "viem";

import {
  getCatalog,
  getOwnedSkillIds,
  verifyLoadout,
  verifyLoadoutPure,
  type ChainReadClient,
  type SkillDef,
} from "./reader.ts";

const REGISTRY: Address = "0x1111111111111111111111111111111111111111";
const COLLECTION: Address = "0x2222222222222222222222222222222222222222";
const OWNER: Address = "0x3333333333333333333333333333333333333333";

interface RawSkillOverrides {
  skillId?: number;
  effectType?: string;
  charges?: number;
  cooldown?: number;
  maxPerLoadout?: number;
  rarity?: number;
  active?: boolean;
  metadataURI?: string;
}

function rawSkill(overrides: RawSkillOverrides = {}) {
  return {
    skillId: 1,
    effectType: "0x5749",
    charges: 1,
    cooldown: 0,
    maxPerLoadout: 1,
    rarity: 10,
    active: true,
    metadataURI: "ipfs://x",
    ...overrides,
  };
}

/** Builds a ChainReadClient stub that dispatches on functionName - see reader.ts's ChainReadClient. */
function mockClient(handlers: Record<string, (args?: readonly unknown[]) => unknown>): ChainReadClient {
  return {
    async readContract({ functionName, args }) {
      const handler = handlers[functionName];
      if (!handler) throw new Error(`mockClient: unexpected call to ${functionName}`);
      return handler(args);
    },
  };
}

function skillDef(overrides: Partial<SkillDef> = {}): SkillDef {
  return {
    skillId: 1,
    effectType: "0x5749",
    charges: 1,
    cooldown: 0,
    maxPerLoadout: 1,
    rarity: 0,
    active: true,
    metadataURI: "",
    ...overrides,
  };
}

function catalogOf(defs: SkillDef[]): Map<number, SkillDef> {
  return new Map(defs.map((def) => [def.skillId, def]));
}

// -- getCatalog ---------------------------------------------------------

test("getCatalog fetches ids 1..nextSkillId-1 via getSkill", async () => {
  const client = mockClient({
    nextSkillId: () => 3n,
    getSkill: (args) => {
      const id = Number(args![0]);
      return rawSkill({ skillId: id, metadataURI: `ipfs://${id}` });
    },
  });

  const catalog = await getCatalog(client, REGISTRY);

  assert.equal(catalog.length, 2);
  assert.deepEqual(catalog.map((def) => def.skillId), [1, 2]);
  assert.equal(catalog[0]!.metadataURI, "ipfs://1");
  assert.equal(catalog[1]!.metadataURI, "ipfs://2");
});

test("getCatalog returns an empty array when nextSkillId is 1 (no skills registered yet)", async () => {
  const client = mockClient({ nextSkillId: () => 1n });
  const catalog = await getCatalog(client, REGISTRY);
  assert.deepEqual(catalog, []);
});

test("getCatalog normalizes uint8/uint16 fields to plain numbers", async () => {
  const client = mockClient({
    nextSkillId: () => 2n,
    getSkill: () => rawSkill({ charges: 1, cooldown: 0, maxPerLoadout: 2, rarity: 10 }),
  });

  const [def] = await getCatalog(client, REGISTRY);
  assert.equal(typeof def!.charges, "number");
  assert.equal(typeof def!.maxPerLoadout, "number");
  assert.equal(typeof def!.rarity, "number");
});

// -- getOwnedSkillIds -----------------------------------------------------

test("getOwnedSkillIds keeps only ids with balance > 0", async () => {
  const client = mockClient({
    balanceOfBatch: (args) => {
      const ids = args![1] as bigint[];
      return ids.map((id) => (id === 2n ? 5n : 0n));
    },
  });

  const owned = await getOwnedSkillIds(client, COLLECTION, OWNER, [1, 2, 3]);
  assert.deepEqual(owned, [2]);
});

test("getOwnedSkillIds returns [] without calling the chain for an empty id list", async () => {
  const client = mockClient({});
  const owned = await getOwnedSkillIds(client, COLLECTION, OWNER, []);
  assert.deepEqual(owned, []);
});

// -- verifyLoadoutPure ------------------------------------------------------

test("verifyLoadoutPure accepts an empty loadout", () => {
  const result = verifyLoadoutPure(new Map(), new Set(), []);
  assert.equal(result.valid, true);
});

test("verifyLoadoutPure rejects more than 2 skills", () => {
  const result = verifyLoadoutPure(new Map(), new Set(), [1, 2, 3]);
  assert.equal(result.valid, false);
  assert.match(result.reason!, /at most 2/);
});

test("verifyLoadoutPure rejects an unregistered skill id", () => {
  const result = verifyLoadoutPure(new Map(), new Set([1]), [1]);
  assert.equal(result.valid, false);
  assert.match(result.reason!, /does not exist/);
});

test("verifyLoadoutPure rejects an inactive skill", () => {
  const catalog = catalogOf([skillDef({ skillId: 1, active: false })]);
  const result = verifyLoadoutPure(catalog, new Set([1]), [1]);
  assert.equal(result.valid, false);
  assert.match(result.reason!, /not active/);
});

test("verifyLoadoutPure rejects a skill the owner doesn't hold", () => {
  const catalog = catalogOf([skillDef({ skillId: 1, active: true })]);
  const result = verifyLoadoutPure(catalog, new Set(), [1]);
  assert.equal(result.valid, false);
  assert.match(result.reason!, /not owned/);
});

test("verifyLoadoutPure rejects a skill repeated beyond its own maxPerLoadout", () => {
  const catalog = catalogOf([skillDef({ skillId: 1, maxPerLoadout: 1 })]);
  const result = verifyLoadoutPure(catalog, new Set([1]), [1, 1]);
  assert.equal(result.valid, false);
  assert.match(result.reason!, /maxPerLoadout/);
});

test("verifyLoadoutPure accepts a skill repeated within its own maxPerLoadout", () => {
  const catalog = catalogOf([skillDef({ skillId: 1, maxPerLoadout: 2 })]);
  const result = verifyLoadoutPure(catalog, new Set([1]), [1, 1]);
  assert.equal(result.valid, true);
});

test("verifyLoadoutPure accepts a valid 2-distinct-skill loadout", () => {
  const catalog = catalogOf([
    skillDef({ skillId: 1, maxPerLoadout: 1 }),
    skillDef({ skillId: 2, maxPerLoadout: 1 }),
  ]);
  const result = verifyLoadoutPure(catalog, new Set([1, 2]), [1, 2]);
  assert.equal(result.valid, true);
});

// -- verifyLoadout (fetch + pure logic together) ----------------------------

test("verifyLoadout end-to-end against a mock client: valid loadout", async () => {
  const client = mockClient({
    nextSkillId: () => 3n,
    getSkill: (args) => rawSkill({ skillId: Number(args![0]), maxPerLoadout: 1 }),
    balanceOfBatch: (args) => (args![1] as bigint[]).map(() => 1n),
  });

  const result = await verifyLoadout(
    client,
    { registryAddress: REGISTRY, collectionAddress: COLLECTION },
    OWNER,
    [1, 2],
  );
  assert.equal(result.valid, true);
});

test("verifyLoadout end-to-end against a mock client: rejects an unowned skill", async () => {
  const client = mockClient({
    nextSkillId: () => 2n,
    getSkill: (args) => rawSkill({ skillId: Number(args![0]) }),
    balanceOfBatch: (args) => (args![1] as bigint[]).map(() => 0n),
  });

  const result = await verifyLoadout(
    client,
    { registryAddress: REGISTRY, collectionAddress: COLLECTION },
    OWNER,
    [1],
  );
  assert.equal(result.valid, false);
  assert.match(result.reason!, /not owned/);
});

test("verifyLoadout end-to-end against a mock client: rejects an inactive skill even if owned", async () => {
  const client = mockClient({
    nextSkillId: () => 2n,
    getSkill: (args) => rawSkill({ skillId: Number(args![0]), active: false }),
    balanceOfBatch: (args) => (args![1] as bigint[]).map(() => 1n),
  });

  const result = await verifyLoadout(
    client,
    { registryAddress: REGISTRY, collectionAddress: COLLECTION },
    OWNER,
    [1],
  );
  assert.equal(result.valid, false);
  assert.match(result.reason!, /not active/);
});

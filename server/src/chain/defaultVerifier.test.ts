/**
 * Unit tests for createDefaultLoadoutVerifier's RESOLUTION logic only (env
 * vars vs deployments-file fallback vs "not configured") - deliberately
 * never invokes the returned verifier, so this needs no RPC endpoint at
 * all. The real GIWA Sepolia deployment
 * (contracts/deployments/91342.json, see CLAUDE.md) is used as a real
 * "file present" fixture; happy-path chain calls are covered by
 * reader.test.ts (mocked) and chain.integration.test.ts (real anvil, `pnpm
 * test:chain`).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createDefaultLoadoutVerifier } from "./defaultVerifier.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REAL_DEPLOYMENTS_PATH = path.resolve(HERE, "../../../contracts/deployments/91342.json");
const NONEXISTENT_PATH = path.resolve(HERE, "does-not-exist-91342.json");

test("returns undefined when no env vars and no deployments file exist", () => {
  const verifier = createDefaultLoadoutVerifier({}, NONEXISTENT_PATH);
  assert.equal(verifier, undefined);
});

test("returns undefined when only REGISTRY_ADDRESS is set (COLLECTION_ADDRESS missing)", () => {
  const verifier = createDefaultLoadoutVerifier(
    { REGISTRY_ADDRESS: "0x1111111111111111111111111111111111111111" },
    NONEXISTENT_PATH,
  );
  assert.equal(verifier, undefined);
});

test("returns a verifier when both REGISTRY_ADDRESS and COLLECTION_ADDRESS are set", () => {
  const verifier = createDefaultLoadoutVerifier(
    {
      REGISTRY_ADDRESS: "0x1111111111111111111111111111111111111111",
      COLLECTION_ADDRESS: "0x2222222222222222222222222222222222222222",
    },
    NONEXISTENT_PATH,
  );
  assert.equal(typeof verifier, "function");
});

test("falls back to the deployments file when no env vars are set", () => {
  const verifier = createDefaultLoadoutVerifier({}, REAL_DEPLOYMENTS_PATH);
  assert.equal(typeof verifier, "function");
});

test("env vars take priority over the deployments file when both are present", () => {
  const verifier = createDefaultLoadoutVerifier(
    {
      REGISTRY_ADDRESS: "0x1111111111111111111111111111111111111111",
      COLLECTION_ADDRESS: "0x2222222222222222222222222222222222222222",
    },
    REAL_DEPLOYMENTS_PATH,
  );
  assert.equal(typeof verifier, "function");
});

test("returns undefined for a malformed deployments file (missing contracts field)", () => {
  const verifier = createDefaultLoadoutVerifier({}, path.join(HERE, "abi.ts"));
  assert.equal(verifier, undefined);
});

/**
 * Optional end-to-end proof that ./reader.ts's ABI (abi.ts) actually
 * matches the deployed contracts, not just our assumptions about them:
 * spins up a real local chain (anvil), deploys the real contracts (forge
 * script script/Deploy.s.sol), registers one real skill through
 * SkillFactory, then reads it back via getCatalog over real JSON-RPC.
 *
 * Skipped by default (needs anvil + forge on PATH and takes a few seconds)
 * - run explicitly via `pnpm test:chain` (sets RUN_CHAIN_TESTS=1), or the
 * env var directly: `RUN_CHAIN_TESTS=1 node --test src/chain/chain.integration.test.ts`.
 *
 * Cleans up its own chain-id-31337 deployment/broadcast artifacts under
 * contracts/ afterwards, since those aren't meant to be kept around (a
 * fresh local anvil chain id every run).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, execFile, type ChildProcessWithoutNullStreams } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http as httpTransport,
  padHex,
  parseAbi,
  stringToHex,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { getCatalog, type ChainReadClient } from "./reader.ts";

const RUN_CHAIN_TESTS = process.env.RUN_CHAIN_TESTS === "1";
const SKIP_REASON = "set RUN_CHAIN_TESTS=1 to run (spawns anvil + forge script against a local chain)";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CONTRACTS_DIR = path.resolve(HERE, "../../../contracts");
const ANVIL_CHAIN_ID = 31337;

/** Anvil's well-known default account #0 (mnemonic "test test ... junk"). */
const ANVIL_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const;

const execFileAsync = promisify(execFile);

/** Resolves with the ephemeral port anvil bound to, parsed from its own "Listening on ..." log line. */
function waitForAnvilPort(proc: ChildProcessWithoutNullStreams, timeoutMs = 15_000): Promise<number> {
  return new Promise((resolve, reject) => {
    let buffer = "";
    const timer = setTimeout(() => reject(new Error("anvil did not report a listening port in time")), timeoutMs);

    proc.stdout.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      const match = buffer.match(/Listening on 127\.0\.0\.1:(\d+)/);
      if (match) {
        clearTimeout(timer);
        resolve(Number(match[1]));
      }
    });

    proc.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`anvil exited early with code ${code}`));
    });
  });
}

interface DeploymentsManifest {
  readonly chainId: number;
  readonly contracts: Record<string, Address>;
}

test(
  "chain reader integration: getCatalog reads a real skill off a freshly deployed local chain",
  { skip: RUN_CHAIN_TESTS ? false : SKIP_REASON },
  async () => {
    const anvil = spawn("anvil", ["--port", "0"], { cwd: CONTRACTS_DIR });

    try {
      const port = await waitForAnvilPort(anvil);
      const rpcUrl = `http://127.0.0.1:${port}`;

      // Deploy.s.sol writes deployments/<chainId>.json via vm.writeJson,
      // which (unlike a shell redirect) does NOT create its parent
      // directory - make sure it exists first.
      await mkdir(path.join(CONTRACTS_DIR, "deployments"), { recursive: true });

      await execFileAsync("forge", ["script", "script/Deploy.s.sol", "--rpc-url", rpcUrl, "--broadcast"], {
        cwd: CONTRACTS_DIR,
        env: { ...process.env, PRIVATE_KEY: ANVIL_PRIVATE_KEY },
      });

      const deploymentsPath = path.join(CONTRACTS_DIR, "deployments", `${ANVIL_CHAIN_ID}.json`);
      const manifest = JSON.parse(await readFile(deploymentsPath, "utf8")) as DeploymentsManifest;
      const registryAddress = manifest.contracts.SkillRegistry;
      const collectionAddress = manifest.contracts.SkillCollection;
      const factoryAddress = manifest.contracts.SkillFactory;
      assert.ok(registryAddress && collectionAddress && factoryAddress, "deployments manifest missing an address");

      const anvilChain = defineChain({
        id: ANVIL_CHAIN_ID,
        name: "Anvil",
        nativeCurrency: { decimals: 18, name: "Ether", symbol: "ETH" },
        rpcUrls: { default: { http: [rpcUrl] } },
      });

      const account = privateKeyToAccount(ANVIL_PRIVATE_KEY);
      const walletClient = createWalletClient({ account, chain: anvilChain, transport: httpTransport(rpcUrl) });
      const publicClient = createPublicClient({ chain: anvilChain, transport: httpTransport(rpcUrl) });

      // Positional (unnamed) tuple here - simplest for a one-off write; the
      // named `struct SkillDef` declaration lives in ./abi.ts for the reads.
      const factoryAbi = parseAbi([
        "function createSkill((uint256,bytes32,uint8,uint8,uint8,uint16,bool,string) def, uint256 maxSupply, uint256 price) returns (uint256)",
      ]);

      const effectType = padHex(stringToHex("WILD_DAUB"), { size: 32 });
      const hash = await walletClient.writeContract({
        address: factoryAddress,
        abi: factoryAbi,
        functionName: "createSkill",
        args: [[0n, effectType, 1, 0, 2, 10, true, "ipfs://wild-daub"], 100n, 1_000_000_000_000_000n],
      });
      await publicClient.waitForTransactionReceipt({ hash });

      // Adapter satisfying reader.ts's thin ChainReadClient from the real,
      // heavily-generic viem PublicClient - proves a real client works,
      // without reader.ts needing to depend on viem's exact client types.
      const client: ChainReadClient = {
        readContract: (args) => publicClient.readContract(args as Parameters<typeof publicClient.readContract>[0]),
      };

      const catalog = await getCatalog(client, registryAddress);

      assert.equal(catalog.length, 1);
      assert.equal(catalog[0]!.skillId, 1);
      assert.equal(catalog[0]!.effectType.toLowerCase(), effectType.toLowerCase());
      assert.equal(catalog[0]!.charges, 1);
      assert.equal(catalog[0]!.maxPerLoadout, 2);
      assert.equal(catalog[0]!.rarity, 10);
      assert.equal(catalog[0]!.active, true);
      assert.equal(catalog[0]!.metadataURI, "ipfs://wild-daub");
    } finally {
      anvil.kill();
      // Only this chain id's artifacts - anvil's chain id is always 31337,
      // never a real deployment, so these are safe to discard every run.
      await rm(path.join(CONTRACTS_DIR, "deployments", `${ANVIL_CHAIN_ID}.json`), { force: true });
      await rm(path.join(CONTRACTS_DIR, "broadcast", "Deploy.s.sol", String(ANVIL_CHAIN_ID)), {
        recursive: true,
        force: true,
      });
      await rm(path.join(CONTRACTS_DIR, "cache", "Deploy.s.sol", String(ANVIL_CHAIN_ID)), {
        recursive: true,
        force: true,
      });
    }
  },
);

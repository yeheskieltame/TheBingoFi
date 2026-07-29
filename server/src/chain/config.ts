/**
 * GIWA Sepolia chain definition + server-side chain config (RPC URL +
 * contract addresses). Everything is overridable via env so the exact same
 * code can target a local anvil instance in tests (see
 * chain.integration.test.ts) or a real deployment - see CLAUDE.md's "GIWA
 * Chain" section for the network's canonical values.
 */

import { createPublicClient, defineChain, http, type Address, type PublicClient } from "viem";

/** GIWA Sepolia - OP Stack L2, target testnet for TheBingoFi (see CLAUDE.md). */
export const giwaSepolia = defineChain({
  id: 91342,
  name: "GIWA Sepolia",
  nativeCurrency: { decimals: 18, name: "Ether", symbol: "ETH" },
  rpcUrls: {
    default: { http: ["https://sepolia-rpc.giwa.io/"] },
  },
  blockExplorers: {
    default: { name: "GIWA Sepolia Explorer", url: "https://sepolia-explorer.giwa.io" },
  },
  testnet: true,
});

const ZERO_ADDRESS: Address = "0x0000000000000000000000000000000000000000";

export interface ChainConfig {
  readonly rpcUrl: string;
  readonly registryAddress: Address;
  readonly collectionAddress: Address;
  readonly marketplaceAddress: Address;
}

function envAddress(env: NodeJS.ProcessEnv, name: string): Address {
  const value = env[name];
  return value && value.length > 0 ? (value as Address) : ZERO_ADDRESS;
}

/**
 * Reads RPC_URL / REGISTRY_ADDRESS / COLLECTION_ADDRESS / MARKETPLACE_ADDRESS
 * from `env` (defaults to process.env). Falls back to the public GIWA
 * Sepolia RPC when RPC_URL is unset, and to the zero address for any
 * contract not yet deployed/known - callers that need a real address should
 * check for that before using it.
 */
export function loadChainConfig(env: NodeJS.ProcessEnv = process.env): ChainConfig {
  const rpcUrl = env.RPC_URL && env.RPC_URL.length > 0 ? env.RPC_URL : giwaSepolia.rpcUrls.default.http[0]!;
  return {
    rpcUrl,
    registryAddress: envAddress(env, "REGISTRY_ADDRESS"),
    collectionAddress: envAddress(env, "COLLECTION_ADDRESS"),
    marketplaceAddress: envAddress(env, "MARKETPLACE_ADDRESS"),
  };
}

/** A read-only viem PublicClient pointed at `cfg.rpcUrl` on GIWA Sepolia. */
export function createChainClient(cfg: Pick<ChainConfig, "rpcUrl">): PublicClient {
  return createPublicClient({ chain: giwaSepolia, transport: http(cfg.rpcUrl) });
}

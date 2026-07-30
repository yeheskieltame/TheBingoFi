/**
 * GIWA Sepolia chain definition + contract addresses/ABIs + a read-only
 * viem PublicClient + the wagmi config, all in one place per the FE task
 * brief ("Address kontrak & RPC via web/src/lib/chain.ts").
 *
 * Mirrors server/src/chain/config.ts's `giwaSepolia` definition (kept
 * independent rather than imported - @thebingofi/server only exports
 * "./protocol" and "./engine", see web/README.md) and CLAUDE.md's "GIWA
 * Chain" section for the canonical network values.
 *
 * Contract addresses default to the live GIWA Sepolia deployment (see
 * contracts/deployments/91342.json) and can be overridden per-env via
 * NEXT_PUBLIC_* vars (e.g. to point at a different deployment) - see
 * web/.env.example.
 *
 * Only an injected connector (MetaMask & friends) is configured - no
 * WalletConnect/cloud projectId, per the FE task brief.
 */

import { createConfig, http, injected } from "wagmi";
import { createPublicClient, defineChain, type Abi, type Address } from "viem";

import marketplaceAbiJson from "../../../contracts/abi/Marketplace.json";
import skillCollectionAbiJson from "../../../contracts/abi/SkillCollection.json";
import skillFactoryAbiJson from "../../../contracts/abi/SkillFactory.json";
import skillRegistryAbiJson from "../../../contracts/abi/SkillRegistry.json";

// ABI JSON imports get a widened (non-literal) TS type from
// `resolveJsonModule` - cast through `unknown` to viem's loose `Abi` type
// rather than fighting for perfect literal inference on external JSON.
export const marketplaceAbi = marketplaceAbiJson as unknown as Abi;
export const skillCollectionAbi = skillCollectionAbiJson as unknown as Abi;
export const skillFactoryAbi = skillFactoryAbiJson as unknown as Abi;
export const skillRegistryAbi = skillRegistryAbiJson as unknown as Abi;

/** GIWA Sepolia - OP Stack L2 testnet, target chain for TheBingoFi (see CLAUDE.md). */
export const giwaSepolia = defineChain({
  id: 91342,
  name: "GIWA Sepolia",
  nativeCurrency: { decimals: 18, name: "Ether", symbol: "ETH" },
  rpcUrls: {
    default: { http: [process.env.NEXT_PUBLIC_RPC_URL || "https://sepolia-rpc.giwa.io/"] },
  },
  blockExplorers: {
    default: { name: "GIWA Sepolia Explorer", url: "https://sepolia-explorer.giwa.io" },
  },
  testnet: true,
});

/** Live GIWA Sepolia addresses (contracts/deployments/91342.json) - default when no env override is set. */
const DEFAULT_ADDRESSES = {
  registry: "0xEb1d19B0d95b73Ef1A6e00B2D83f8F69999e2BD4",
  factory: "0xa9F2f90b5275e217a8b76049fFF4A0c6EC8Ead0D",
  collection: "0x1204602e50af5d714Fc1A8c6d7EbFa01bEEC3B10",
  marketplace: "0x127b3d2F1b15720BAF6Df299b4e5E7f50c785c9d",
} as const;

function envAddress(value: string | undefined, fallback: string): Address {
  return (value && value.length > 0 ? value : fallback) as Address;
}

/** Contract addresses - env-overridable, defaulting to the live GIWA Sepolia deployment above. */
export const contractAddresses = {
  registry: envAddress(process.env.NEXT_PUBLIC_REGISTRY_ADDRESS, DEFAULT_ADDRESSES.registry),
  factory: envAddress(process.env.NEXT_PUBLIC_FACTORY_ADDRESS, DEFAULT_ADDRESSES.factory),
  collection: envAddress(process.env.NEXT_PUBLIC_COLLECTION_ADDRESS, DEFAULT_ADDRESSES.collection),
  marketplace: envAddress(process.env.NEXT_PUBLIC_MARKETPLACE_ADDRESS, DEFAULT_ADDRESSES.marketplace),
} as const;

/**
 * Read-only viem client, independent of wallet connection state - used for
 * catalog/ownership/sale reads that must work even for guests (see
 * hooks/useSkillCatalog.ts, hooks/useSkillOwnership.ts,
 * hooks/useMarketplaceSales.ts). Writes (Marketplace.buy) go through wagmi
 * instead, see hooks/useBuySkill.ts.
 */
export const publicClient = createPublicClient({
  chain: giwaSepolia,
  transport: http(giwaSepolia.rpcUrls.default.http[0]),
});

/**
 * wagmi config - injected connector only (MetaMask & co.), no
 * WalletConnect/cloud projectId. `ssr: true` defers reading any persisted
 * wallet connection until after the client mounts, so Next's server-
 * rendered HTML (always "disconnected") matches the client's first paint
 * even when a wallet extension would otherwise auto-reconnect - without
 * it, Header's connect/disconnect UI hydration-mismatches for anyone with
 * a previously-connected wallet.
 */
export const wagmiConfig = createConfig({
  chains: [giwaSepolia],
  connectors: [injected()],
  ssr: true,
  transports: {
    [giwaSepolia.id]: http(giwaSepolia.rpcUrls.default.http[0]),
  },
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}

/** `0x1234…abcd` - short display form for an address (Header, Lobby wallet status, market). */
export function truncateAddress(address: string): string {
  if (address.length <= 10) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function explorerAddressUrl(address: string): string {
  return `${giwaSepolia.blockExplorers.default.url}/address/${address}`;
}

export function explorerTxUrl(hash: string): string {
  return `${giwaSepolia.blockExplorers.default.url}/tx/${hash}`;
}

/**
 * Decodes a Solidity `bytes32` value that was packed from an ASCII string
 * (e.g. `bytes32("WILD_DAUB")`, see contracts/src/SkillRegistry.sol's
 * SkillDef.effectType and contracts/script/SeedSkills.s.sol) back into a
 * plain string: hex-decode then strip the trailing NUL padding bytes.
 */
export function decodeEffectType(raw: string): string {
  try {
    const hex = raw.startsWith("0x") ? raw.slice(2) : raw;
    const bytes = hex.match(/.{1,2}/g) ?? [];
    let out = "";
    for (const byte of bytes) {
      const code = parseInt(byte, 16);
      if (code === 0) break;
      out += String.fromCharCode(code);
    }
    return out || raw;
  } catch {
    return raw;
  }
}

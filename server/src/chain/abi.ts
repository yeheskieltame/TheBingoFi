/**
 * Minimal, hand-written ABIs (viem's `parseAbi` human-readable format) for
 * the read-only on-chain surface the game server needs: skill catalog
 * lookups (SkillRegistry) and ownership checks (SkillCollection). These MUST
 * match contracts/src/*.sol exactly - see SkillRegistry.sol,
 * SkillCollection.sol.
 *
 * Marketplace is deliberately absent: the server never reads sale state
 * (pricing/stock is the web client's concern, and it imports the full
 * generated ABI from contracts/abi/Marketplace.json instead of
 * hand-maintaining one). A hand-written `sales()` declaration used to live
 * here, went stale when Marketplace v2 added `lastPurchaseAt`, and was never
 * imported by anything - so it was removed rather than fixed. If the server
 * ever needs Marketplace reads, import contracts/abi/Marketplace.json the
 * same way web/src/lib/chain.ts does.
 *
 * Deliberately not the full contract ABIs: only the read functions the
 * chain reader (./reader.ts) actually calls. Small surface, kept in sync by
 * hand since it changes rarely (adding a skill is a data call, not an ABI
 * change - see CLAUDE.md's SkillFactory.createSkill).
 */

import { parseAbi } from "viem";

/**
 * SkillRegistry.getSkill / nextSkillId / exists. The `SkillDef` field order
 * and types mirror `struct SkillDef` in contracts/src/SkillRegistry.sol.
 * All components are named, so viem decodes `getSkill`'s return value as an
 * object (not a positional tuple/array).
 */
export const skillRegistryAbi = parseAbi([
  "struct SkillDef { uint256 skillId; bytes32 effectType; uint8 charges; uint8 cooldown; uint8 maxPerLoadout; uint16 rarity; bool active; string metadataURI; }",
  "function getSkill(uint256 skillId) view returns (SkillDef)",
  "function nextSkillId() view returns (uint256)",
  "function exists(uint256 skillId) view returns (bool)",
]);

/**
 * SkillCollection.balanceOfBatch / uri - standard ERC-1155 reads (see
 * contracts/src/SkillCollection.sol, which only adds mint/setURI/royalty on
 * top of OpenZeppelin's ERC1155).
 */
export const skillCollectionAbi = parseAbi([
  "function balanceOfBatch(address[] accounts, uint256[] ids) view returns (uint256[])",
  "function uri(uint256 id) view returns (string)",
]);

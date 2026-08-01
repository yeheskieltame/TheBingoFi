import type { SkillMetadataResponse } from "@thebingofi/server/protocol";

/** Art shown on a board cell whose number matches an OWNED skill's Featured Number. */
export interface BoardSkin {
  readonly imageUrl: string;
  readonly skillName: string;
}

/**
 * Board-number -> skin map, for MatchBoard/DraftBoard to paint a cell with
 * the owning player's skill artwork instead of a plain number (task brief:
 * "sel board pakai artwork NFT skill yang DIMILIKI pemain, sebagai skin").
 *
 * Pure - takes exactly what it needs and nothing more:
 * - `metadata`: GET /metadata/:id.json per skillId (hooks/useSkillMetadata.ts).
 *   The featured number comes from that response's `attributes` array (an
 *   entry with `trait_type: "Featured Number"`, added server-side - see
 *   server/src/api/http.ts's EFFECT_FEATURED_NUMBER) - NEVER hardcoded here,
 *   per this task's brief. A skill without that attribute simply contributes
 *   no skin, not an error.
 * - `balances`: skillId -> on-chain balance (hooks/useSkillOwnership.ts).
 *   Only balance > 0n (actually owned) yields a skin.
 *
 * If two owned skills claim the same Featured Number (not possible with
 * today's 5 skills - 1,2,8,13,25 are all distinct - but nothing in the
 * schema forbids it later), the lowest skillId wins: iterate ids in
 * ascending order and never overwrite a number that's already claimed, so
 * the result is deterministic regardless of Map iteration/insertion order.
 */
export function boardSkinsFrom(
  metadata: ReadonlyMap<number, SkillMetadataResponse>,
  balances: ReadonlyMap<number, bigint>,
): ReadonlyMap<number, BoardSkin> {
  const skins = new Map<number, BoardSkin>();
  const ownedIds = Array.from(metadata.keys())
    .filter((skillId) => (balances.get(skillId) ?? 0n) > 0n)
    .sort((a, b) => a - b);

  for (const skillId of ownedIds) {
    const meta = metadata.get(skillId)!;
    const featured = meta.attributes.find((attribute) => attribute.trait_type === "Featured Number");
    if (!featured) continue;

    const number = Number(featured.value);
    if (!Number.isInteger(number)) continue;

    if (skins.has(number)) continue; // lower skillId already claimed this number (see doc comment)
    skins.set(number, { imageUrl: meta.image, skillName: meta.name });
  }

  return skins;
}

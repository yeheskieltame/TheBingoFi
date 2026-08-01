/**
 * Avatar tint derived from a nickname - the same person always gets the same
 * color, with no state/storage needed. Shared by every Plaza avatar
 * (PlazaAvatar) so a nickname reads consistently across the composer, posts,
 * and replies. Previously lived inline in components/PlazaMessageList.tsx;
 * moved to lib/ once more than one component needed it (see web/README.md's
 * "Aturan pembagian kerja": pure logic belongs in lib/, components just
 * render).
 */
const AVATAR_TINTS = [
  "bg-glacier/70",
  "bg-sky-500/60",
  "bg-indigo-500/60",
  "bg-teal-500/55",
  "bg-violet-500/55",
  "bg-cyan-500/55",
] as const;

export function avatarTint(nickname: string): string {
  let hash = 0;
  for (let i = 0; i < nickname.length; i++) hash = (hash * 31 + nickname.charCodeAt(i)) >>> 0;
  return AVATAR_TINTS[hash % AVATAR_TINTS.length]!;
}

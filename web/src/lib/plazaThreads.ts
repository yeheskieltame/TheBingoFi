import type { PlazaMessage } from "@thebingofi/server/protocol";

/**
 * One top-level Plaza post plus its replies, oldest -> newest (see
 * groupPlazaThreads below). Purely a display grouping - the server (see
 * server/src/plaza/plaza.ts) never stores this shape, only the flat
 * chronological `PlazaMessage[]` history/broadcast.
 */
export interface PlazaThread {
  readonly post: PlazaMessage;
  readonly replies: readonly PlazaMessage[];
}

/**
 * Groups the flat, chronological (oldest -> newest) history returned by
 * `plaza:history`/appended by `plaza:message` (hooks/usePlaza.ts) into
 * X-style threads: each top-level post with its replies attached, newest
 * post first.
 *
 * A message counts as a reply only if its `replyTo` resolves to another
 * message CURRENTLY in `messages` - the server allows a reply's parent to
 * age out of its own history buffer over time (see plaza.ts's doc on
 * `replyTo`), and a reply sent before its parent loaded into this client's
 * buffer would otherwise point at nothing. Either way, an unresolvable
 * `replyTo` is rendered as a standalone post rather than dropped.
 *
 * Depth is always <=1 (server-enforced, see plaza.ts's addMessage: "a
 * message that already has a replyTo cannot itself be replied to") - this
 * function doesn't need to recurse.
 */
export function groupPlazaThreads(messages: readonly PlazaMessage[]): readonly PlazaThread[] {
  const knownIds = new Set(messages.map((message) => message.id));
  const repliesByParent = new Map<string, PlazaMessage[]>();
  const posts: PlazaMessage[] = [];

  for (const message of messages) {
    if (message.replyTo !== undefined && knownIds.has(message.replyTo)) {
      const existing = repliesByParent.get(message.replyTo);
      if (existing) existing.push(message);
      else repliesByParent.set(message.replyTo, [message]);
    } else {
      posts.push(message);
    }
  }

  // `messages` arrives oldest -> newest, so both `posts` and each parent's
  // collected replies are already in that order - replies just need
  // reading off as-is, posts need reversing for "newest post first".
  return posts
    .slice()
    .reverse()
    .map((post) => ({ post, replies: repliesByParent.get(post.id) ?? [] }));
}

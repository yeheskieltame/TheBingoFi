import { LuMessagesSquare } from "react-icons/lu";

import PlazaPost from "@/components/PlazaPost";
import { useLocale } from "@/hooks/useLocale";
import { strings } from "@/i18n/strings";
import type { PlazaThread } from "@/lib/plazaThreads";
import type { SkillTier } from "@/lib/skillTier";

export interface PlazaFeedProps {
  /** lib/plazaThreads.ts's groupPlazaThreads(messages) - newest post first, replies oldest -> newest. */
  readonly threads: readonly PlazaThread[];
  /** Resolves a skillId (PlazaMessage.skillId) to a display name - falls back to "Skill #<id>" if the catalog hasn't loaded that id (yet). */
  readonly skillName: (skillId: number) => string;
  readonly skillTier: (skillId: number) => SkillTier | undefined;
  /** Current visitor's nickname, "" when not set yet - threaded down to each PlazaPost so its inline reply composer can gate itself (see app/plaza/page.tsx point 4). */
  readonly nickname: string;
  readonly sending: boolean;
  readonly onReply: (parentId: string, text: string, skillId?: number) => void;
}

/**
 * X-style feed body for /plaza (CONCEPT.md §7.4b): one card per top-level
 * post (PlazaPost), each carrying its own replies. Replaces the old flat,
 * fixed-height auto-scrolled chat list (previously PlazaMessageList) -
 * newest post is first, so the feed is normal page flow (the page itself
 * scrolls), not a boxed chat window.
 */
export default function PlazaFeed({ threads, skillName, skillTier, nickname, sending, onReply }: PlazaFeedProps) {
  const locale = useLocale();
  const t = strings[locale].plaza;

  if (threads.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-3xl border border-white/10 bg-night/50 px-6 py-16 text-center backdrop-blur-md">
        <LuMessagesSquare aria-hidden className="size-10 text-ice/30" />
        <p className="font-display text-base font-bold text-frost">{t.emptyFeedTitle}</p>
        <p className="max-w-xs text-sm text-ice/45">{t.emptyHistory}</p>
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {threads.map((thread) => (
        <PlazaPost
          key={thread.post.id}
          post={thread.post}
          replies={thread.replies}
          skillName={skillName}
          skillTier={skillTier}
          nickname={nickname}
          sending={sending}
          onReply={(text, skillId) => onReply(thread.post.id, text, skillId)}
        />
      ))}
    </ul>
  );
}

"use client";

import { useState } from "react";
import type { PlazaMessage } from "@thebingofi/server/protocol";
import { LuMessageCircle } from "react-icons/lu";

import PlazaAvatar from "@/components/PlazaAvatar";
import PlazaComposer from "@/components/PlazaComposer";
import PlazaReply from "@/components/PlazaReply";
import PlazaSkillCard from "@/components/PlazaSkillCard";
import { useLocale } from "@/hooks/useLocale";
import { strings } from "@/i18n/strings";
import { relativeTime } from "@/lib/relativeTime";
import type { SkillTier } from "@/lib/skillTier";

/** "2 balasan teratas" before collapsing the rest behind "Lihat N balasan lainnya" (task brief). */
const VISIBLE_REPLIES = 2;

export interface PlazaPostProps {
  readonly post: PlazaMessage;
  /** Oldest -> newest, from lib/plazaThreads.ts's groupPlazaThreads. */
  readonly replies: readonly PlazaMessage[];
  readonly skillName: (skillId: number) => string;
  readonly skillTier: (skillId: number) => SkillTier | undefined;
  /** Current visitor's nickname - empty string when none is set yet (guest who hasn't filled the field, see app/plaza/page.tsx point 4: the feed itself still renders, only composing is gated). */
  readonly nickname: string;
  /** hooks/usePlaza.ts's `sending` - passed through to the inline reply composer. */
  readonly sending: boolean;
  /** Fires with the reply's (trimmed text, skillId?) - the caller already knows which post this is (closed over `post.id` in app/plaza/page.tsx) and calls usePlaza's `reply`. */
  readonly onReply: (text: string, skillId?: number) => void;
}

/**
 * One top-level Plaza post card (CONCEPT.md §7.4b) - X-style: avatar,
 * nickname, relative time, text, optional skill card, then a "Balas" action
 * row with the reply count. Clicking Balas opens an inline PlazaComposer
 * (no navigation) rather than a separate page - replies render below,
 * indented with a single continuous connector line down the whole thread.
 */
export default function PlazaPost({ post, replies, skillName, skillTier, nickname, sending, onReply }: PlazaPostProps) {
  const locale = useLocale();
  const t = strings[locale].plaza;
  const [replying, setReplying] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const visibleReplies = expanded ? replies : replies.slice(0, VISIBLE_REPLIES);
  const hiddenCount = replies.length - visibleReplies.length;

  function handleReplySubmit(text: string, skillId?: number) {
    onReply(text, skillId);
    setReplying(false);
  }

  return (
    <li className="rounded-3xl border border-white/10 bg-night/50 p-4 backdrop-blur-md sm:p-5">
      <div className="flex gap-3">
        <PlazaAvatar nickname={post.nickname} className="size-9 shrink-0 text-xs sm:size-10 sm:text-sm" />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="font-display font-bold text-frost">{post.nickname}</span>
            <span className="text-xs text-ice/40">
              {relativeTime(post.at, {
                justNow: t.timeJustNow,
                minuteSuffix: t.timeMinuteSuffix,
                hourSuffix: t.timeHourSuffix,
                yesterday: t.timeYesterday,
                daySuffix: t.timeDaySuffix,
              })}
            </span>
          </div>

          <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-frost/85">{post.text}</p>

          {post.skillId !== undefined && (
            <PlazaSkillCard skillId={post.skillId} name={skillName(post.skillId)} tier={skillTier(post.skillId)} />
          )}

          <div className="mt-3 flex items-center gap-4 text-xs text-ice/50">
            <button
              type="button"
              onClick={() => setReplying((value) => !value)}
              aria-expanded={replying}
              className="inline-flex items-center gap-1.5 transition-colors hover:text-frost"
            >
              <LuMessageCircle aria-hidden className="size-4" />
              {t.replyAction}
              {replies.length > 0 && <span className="tabular-nums">{replies.length}</span>}
            </button>
          </div>

          {replying &&
            (nickname ? (
              <div className="mt-3">
                <PlazaComposer
                  nickname={nickname}
                  placeholder={t.replyPlaceholder}
                  submitLabel={t.send}
                  sending={sending}
                  onSubmit={handleReplySubmit}
                  compact
                  autoFocus
                  onCancel={() => setReplying(false)}
                  cancelLabel={t.cancelReply}
                />
              </div>
            ) : (
              <p className="mt-3 text-xs text-ice/45">{t.replyNicknamePrompt}</p>
            ))}

          {visibleReplies.length > 0 && (
            <ul className="mt-3 space-y-3 border-l border-white/10 pl-3.5">
              {visibleReplies.map((reply) => (
                <PlazaReply key={reply.id} reply={reply} skillName={skillName} skillTier={skillTier} />
              ))}
            </ul>
          )}

          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="mt-2 text-xs font-semibold text-glacier transition-colors hover:text-frost"
            >
              {t.viewMoreRepliesPrefix}
              {hiddenCount}
              {t.viewMoreRepliesSuffix}
            </button>
          )}

          {expanded && replies.length > VISIBLE_REPLIES && (
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="mt-2 block text-xs font-semibold text-ice/45 transition-colors hover:text-frost"
            >
              {t.hideReplies}
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

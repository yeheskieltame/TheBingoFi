import type { PlazaMessage } from "@thebingofi/server/protocol";

import PlazaAttachmentCard from "@/components/PlazaAttachmentCard";
import PlazaAvatar from "@/components/PlazaAvatar";
import { useLocale } from "@/hooks/useLocale";
import { strings } from "@/i18n/strings";
import { relativeTime } from "@/lib/relativeTime";
import type { SkillTier } from "@/lib/skillTier";

export interface PlazaReplyProps {
  readonly reply: PlazaMessage;
  readonly skillName: (skillId: number) => string;
  readonly skillTier: (skillId: number) => SkillTier | undefined;
  /** GET /metadata/:id.json's `image` per skillId - see app/plaza/page.tsx's `skillImage`, PlazaAttachmentCard. */
  readonly skillImage: (skillId: number) => string | undefined;
}

/**
 * One reply row inside a PlazaPost's thread. Deliberately not a li with its
 * own connector line - the whole thread's vertical "khas X" line is one
 * continuous border owned by the `<ul>` in PlazaPost (see that file), this
 * component just renders the indented content: smaller avatar, nickname,
 * relative time, text, optional attachment card (skill/result/board, see
 * PlazaAttachmentCard). Replies can't themselves be replied to
 * (server-enforced max depth 1, server/src/plaza/plaza.ts), so there's no
 * reply action here.
 */
export default function PlazaReply({ reply, skillName, skillTier, skillImage }: PlazaReplyProps) {
  const locale = useLocale();
  const t = strings[locale].plaza;

  return (
    <div className="flex gap-2 text-sm">
      <PlazaAvatar nickname={reply.nickname} className="size-7 shrink-0 text-[10px]" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="font-display text-sm font-bold text-frost">{reply.nickname}</span>
          <span className="text-[10px] text-ice/40">
            {relativeTime(reply.at, {
              justNow: t.timeJustNow,
              minuteSuffix: t.timeMinuteSuffix,
              hourSuffix: t.timeHourSuffix,
              yesterday: t.timeYesterday,
              daySuffix: t.timeDaySuffix,
            })}
          </span>
        </div>
        <p className="whitespace-pre-wrap break-words text-frost/80">{reply.text}</p>
        {reply.attachment && (
          <PlazaAttachmentCard
            attachment={reply.attachment}
            skillName={skillName}
            skillTier={skillTier}
            skillImage={skillImage}
          />
        )}
      </div>
    </div>
  );
}

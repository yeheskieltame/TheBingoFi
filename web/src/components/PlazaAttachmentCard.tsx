import type { PlazaAttachment } from "@thebingofi/server/protocol";

import PlazaBoardAttachment from "@/components/PlazaBoardAttachment";
import PlazaResultAttachment from "@/components/PlazaResultAttachment";
import PlazaSkillAttachment from "@/components/PlazaSkillAttachment";
import type { SkillTier } from "@/lib/skillTier";

export interface PlazaAttachmentCardProps {
  readonly attachment: PlazaAttachment;
  /** Resolves a skillId to a display name - see app/plaza/page.tsx's `skillName`. Only used for `kind: "skill"`. */
  readonly skillName: (skillId: number) => string;
  readonly skillTier: (skillId: number) => SkillTier | undefined;
  /** GET /metadata/:id.json's `image` per skillId - see app/plaza/page.tsx's `skillImage`. */
  readonly skillImage: (skillId: number) => string | undefined;
}

/**
 * Picks the right showcase card for a Plaza message's `attachment`
 * (server/API.md's Plaza chat section - `PlazaAttachment` is a `kind`
 * discriminated union: skill/result/board). One switch, shared by
 * PlazaPost and PlazaReply so both surfaces render every attachment kind
 * identically without duplicating the branch. Note: the server already
 * normalizes legacy `skillId`-only messages into `attachment: { kind:
 * "skill", skillId }` (see plaza/plaza.ts's withNormalizedAttachment), so
 * callers only ever need to read `message.attachment`, never `message.skillId`.
 */
export default function PlazaAttachmentCard({ attachment, skillName, skillTier, skillImage }: PlazaAttachmentCardProps) {
  switch (attachment.kind) {
    case "skill":
      return (
        <PlazaSkillAttachment
          skillId={attachment.skillId}
          name={skillName(attachment.skillId)}
          tier={skillTier(attachment.skillId)}
          imageUrl={skillImage(attachment.skillId)}
        />
      );
    case "result":
      return (
        <PlazaResultAttachment
          won={attachment.won}
          lines={attachment.lines}
          calls={attachment.calls}
          opponent={attachment.opponent}
        />
      );
    case "board":
      return <PlazaBoardAttachment numbers={attachment.numbers} marked={attachment.marked} />;
    default:
      return null;
  }
}

"use client";

import { useEffect, useRef } from "react";
import type { PlazaMessage } from "@thebingofi/server/protocol";

import PlazaSkillCard from "@/components/PlazaSkillCard";
import { useLocale } from "@/hooks/useLocale";
import { strings } from "@/i18n/strings";
import type { SkillTier } from "@/lib/skillTier";

export interface PlazaMessageListProps {
  readonly messages: readonly PlazaMessage[];
  /** Resolves a skillId (PlazaMessage.skillId) to a display name - falls back to "Skill #<id>" if the catalog hasn't loaded that id (yet). */
  readonly skillName: (skillId: number) => string;
  readonly skillTier: (skillId: number) => SkillTier | undefined;
}

/** Warna avatar diturunkan dari nickname supaya orang yang sama selalu punya warna yang sama, tanpa perlu state/nyimpen apa pun. */
const AVATAR_TINTS = [
  "bg-glacier/70",
  "bg-sky-500/60",
  "bg-indigo-500/60",
  "bg-teal-500/55",
  "bg-violet-500/55",
  "bg-cyan-500/55",
] as const;

function tintFor(nickname: string): string {
  let hash = 0;
  for (let i = 0; i < nickname.length; i++) hash = (hash * 31 + nickname.charCodeAt(i)) >>> 0;
  return AVATAR_TINTS[hash % AVATAR_TINTS.length]!;
}

/**
 * Scrolling message list for /plaza (CONCEPT.md §7.4b), auto-scrolled to the
 * newest message. Auto-scroll is local, UI-only state (see web/README.md's
 * note on SkillPanel's Nullify countdown for the same carve-out) - not
 * something hooks/usePlaza.ts needs to own.
 */
export default function PlazaMessageList({ messages, skillName, skillTier }: PlazaMessageListProps) {
  const locale = useLocale();
  const t = strings[locale].plaza;
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  if (messages.length === 0) {
    return (
      <p className="flex h-96 items-center justify-center rounded-3xl border border-white/10 bg-night/50 text-sm text-ice/45 backdrop-blur-md">
        {t.emptyHistory}
      </p>
    );
  }

  return (
    <ul className="flex h-96 flex-col gap-3 overflow-y-auto rounded-3xl border border-white/10 bg-night/50 p-4 backdrop-blur-md">
      {messages.map((message) => (
        <li key={message.id} className="flex gap-2.5 text-sm">
          <span
            aria-hidden
            className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-full font-display text-xs font-bold text-frost ${tintFor(message.nickname)}`}
          >
            {message.nickname.slice(0, 2).toUpperCase()}
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="font-display font-bold text-frost">{message.nickname}</span>
              <span className="text-[10px] text-ice/35">{new Date(message.at).toLocaleTimeString()}</span>
            </div>
            <p className="break-words text-frost/80">{message.text}</p>
            {message.skillId !== undefined && (
              <PlazaSkillCard
                skillId={message.skillId}
                name={skillName(message.skillId)}
                tier={skillTier(message.skillId)}
              />
            )}
          </div>
        </li>
      ))}
      <div ref={bottomRef} />
    </ul>
  );
}

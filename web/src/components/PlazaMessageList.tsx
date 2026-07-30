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
      <p className="flex h-96 items-center justify-center rounded border border-slate-800 bg-slate-900/40 text-sm text-slate-500">
        {t.emptyHistory}
      </p>
    );
  }

  return (
    <ul className="flex h-96 flex-col gap-3 overflow-y-auto rounded border border-slate-800 bg-slate-900/40 p-3">
      {messages.map((message) => (
        <li key={message.id} className="text-sm">
          <div className="flex items-baseline gap-2">
            <span className="font-semibold text-indigo-300">{message.nickname}</span>
            <span className="text-[10px] text-slate-500">{new Date(message.at).toLocaleTimeString()}</span>
          </div>
          <p className="break-words text-slate-200">{message.text}</p>
          {message.skillId !== undefined && (
            <PlazaSkillCard skillId={message.skillId} name={skillName(message.skillId)} tier={skillTier(message.skillId)} />
          )}
        </li>
      ))}
      <div ref={bottomRef} />
    </ul>
  );
}

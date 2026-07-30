import type { QuestCompletedPayload } from "@thebingofi/server/protocol";

import { useLocale } from "@/hooks/useLocale";
import { strings } from "@/i18n/strings";

export interface QuestNotificationsProps {
  readonly notifications: readonly QuestCompletedPayload[];
}

/** Dumb: plain list of quest:completed events received this session (see /play). */
export default function QuestNotifications({ notifications }: QuestNotificationsProps) {
  const locale = useLocale();
  const t = strings[locale].play.quests;

  if (notifications.length === 0) return null;

  return (
    <section
      aria-live="polite"
      className="space-y-1 rounded-2xl border border-amber-400/40 bg-amber-500/15 p-3 text-sm text-amber-100 backdrop-blur-md"
    >
      <h2 className="font-display font-bold">{t.title}</h2>
      <ul className="space-y-0.5">
        {notifications.map((notification, index) => (
          <li key={`${notification.questId}-${index}`}>🏅 {notification.title}</li>
        ))}
      </ul>
    </section>
  );
}

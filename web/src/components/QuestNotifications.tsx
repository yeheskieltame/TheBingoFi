import type { QuestCompletedPayload } from "@thebingofi/server/protocol";

import { strings } from "@/i18n/strings";

const locale = "id";

export interface QuestNotificationsProps {
  readonly notifications: readonly QuestCompletedPayload[];
}

/** Dumb: plain list of quest:completed events received this session (see /play). */
export default function QuestNotifications({ notifications }: QuestNotificationsProps) {
  const t = strings[locale].play.quests;

  if (notifications.length === 0) return null;

  return (
    <section>
      <h2>{t.title}</h2>
      <ul>
        {notifications.map((notification, index) => (
          <li key={`${notification.questId}-${index}`}>{notification.title}</li>
        ))}
      </ul>
    </section>
  );
}

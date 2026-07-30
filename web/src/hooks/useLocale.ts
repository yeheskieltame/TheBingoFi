"use client";

import { useSyncExternalStore } from "react";

import type { Locale } from "@/i18n/strings";
import { getLocale, subscribeLocale } from "@/lib/locale";

/**
 * Reactive current locale (see lib/locale.ts). Server snapshot is always
 * "id" (matches the app's SSR default, see i18n/strings.ts) to avoid a
 * hydration mismatch - same trick as hooks/useStoredPlayerId.ts.
 */
export function useLocale(): Locale {
  return useSyncExternalStore(subscribeLocale, getLocale, () => "id" as Locale);
}

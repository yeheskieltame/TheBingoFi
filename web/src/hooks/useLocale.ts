"use client";

import { useSyncExternalStore } from "react";

import type { Locale } from "@/i18n/strings";
import { getLocale, subscribeLocale } from "@/lib/locale";

/**
 * Reactive current locale (see lib/locale.ts). Server snapshot is always
 * "en" (the app's default, matching lib/locale.ts's DEFAULT_LOCALE and
 * layout.tsx's <html lang>) to avoid a hydration mismatch - same trick as
 * hooks/useStoredAccountId.ts.
 */
export function useLocale(): Locale {
  return useSyncExternalStore(subscribeLocale, getLocale, () => "en" as Locale);
}

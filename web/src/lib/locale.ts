/**
 * Tiny reactive locale store (id/en), backed by localStorage - same
 * SSR-safe-read pattern as lib/storage.ts, plus a minimal pub-sub so
 * hooks/useLocale.ts can re-render every subscriber the instant the
 * language switcher (Header) changes it, without needing a React Context
 * provider wrapping the whole tree.
 */

import type { Locale } from "@/i18n/strings";

const LOCALE_KEY = "thebingofi:locale";

type Listener = () => void;

const listeners = new Set<Listener>();
let current: Locale = "id";
let initialized = false;

function readStored(): Locale {
  if (typeof window === "undefined") return "id";
  try {
    return window.localStorage.getItem(LOCALE_KEY) === "en" ? "en" : "id";
  } catch {
    return "id";
  }
}

function ensureInitialized(): void {
  if (initialized) return;
  initialized = true;
  current = readStored();
}

/** Current locale - "id" during SSR/before hydration, per readStored above. */
export function getLocale(): Locale {
  ensureInitialized();
  return current;
}

export function setLocale(locale: Locale): void {
  ensureInitialized();
  if (current === locale) return;
  current = locale;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(LOCALE_KEY, locale);
    } catch {
      // Storage unavailable - locale still switches for this tab/session.
    }
  }
  for (const listener of listeners) listener();
}

export function subscribeLocale(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

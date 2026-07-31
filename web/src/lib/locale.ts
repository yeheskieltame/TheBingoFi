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
/** Default "en"; "id" hanya dipakai kalau pemain memilihnya sendiri. */
const DEFAULT_LOCALE: Locale = "en";

let current: Locale = DEFAULT_LOCALE;
let initialized = false;

function readStored(): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  try {
    return window.localStorage.getItem(LOCALE_KEY) === "id" ? "id" : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

function ensureInitialized(): void {
  if (initialized) return;
  initialized = true;
  current = readStored();
}

/** Current locale - DEFAULT_LOCALE during SSR/before hydration, per readStored above. */
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

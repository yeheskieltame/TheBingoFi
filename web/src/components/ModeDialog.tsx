"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, type ReactNode } from "react";

import { useLocale } from "@/hooks/useLocale";
import { strings } from "@/i18n/strings";

export interface ModeDialogProps {
  readonly open: boolean;
  readonly title: string;
  readonly description?: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
}

/**
 * Dumb: modal opsi mode main. Opsi sengaja TIDAK dirender inline di bawah
 * deretan kartu - kalau inline, memilih kartu mendorong halaman dan menutupi
 * art; sebagai modal, deretan kartu tetap jadi fokus dan opsinya muncul di
 * atasnya lalu hilang lagi.
 *
 * Animasi: overlay fade + panel spring (motion). Esc dan klik overlay menutup;
 * `overflow-hidden` di <body> dipasang selama terbuka supaya latar tidak ikut
 * ter-scroll di belakang modal.
 */
export default function ModeDialog({ open, title, description, onClose, children }: ModeDialogProps) {
  const locale = useLocale();
  const t = strings[locale].common;

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <button
            type="button"
            aria-label={t.close}
            onClick={onClose}
            className="absolute inset-0 cursor-default bg-night/80 backdrop-blur-sm"
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="relative w-full max-w-md rounded-3xl border border-white/12 bg-night/95 p-5 shadow-2xl shadow-black/60 sm:p-6"
            initial={{ opacity: 0, scale: 0.88, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 12 }}
            transition={{ type: "spring", stiffness: 380, damping: 28 }}
          >
            <button
              type="button"
              onClick={onClose}
              aria-label={t.close}
              autoFocus
              className="absolute right-3 top-3 grid size-8 place-items-center rounded-full border border-white/15 font-display text-sm text-ice transition-colors hover:border-white/35 hover:text-frost"
            >
              ✕
            </button>

            <div className="mb-4 pr-8 text-center">
              <h2 className="font-display text-lg font-bold text-frost">{title}</h2>
              {description && <p className="mx-auto max-w-sm text-xs text-ice/55">{description}</p>}
            </div>

            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

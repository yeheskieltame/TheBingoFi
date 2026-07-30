"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";
import Image from "next/image";
import { createPortal } from "react-dom";
import { LuX } from "react-icons/lu";

import { useLocale } from "@/hooks/useLocale";
import { strings } from "@/i18n/strings";

export interface DialogProps {
  readonly open: boolean;
  readonly title: string;
  readonly description?: string;
  readonly onClose: () => void;
  /** "md" (default) untuk panel opsi, "lg" untuk konten dengan art/statistik. */
  readonly size?: "md" | "lg";
  /**
   * Art panel (opsional). Kalau diisi, modal memakai layout dua kolom: art
   * memenuhi kolom kiri, judul/opsi/aksi di kolom kanan - memberi konteks
   * visual "ini mode apa" alih-alih panel gelap polos. Di layar sempit art
   * turun jadi strip atas supaya kolom kanan tetap lega.
   */
  readonly artImage?: string;
  readonly children: ReactNode;
}

/**
 * Dumb: modal serbaguna. Dipakai untuk opsi mode main (/), leaderboard harian
 * (/daily), dan detail skill (/market) - konten sekunder yang kalau dirender
 * inline malah mendorong halaman dan menutupi art.
 *
 * Animasi: overlay fade + panel spring (motion). Esc dan klik overlay menutup;
 * `overflow-hidden` di <body> dipasang selama terbuka supaya latar tidak ikut
 * ter-scroll di belakang modal. Di-portal ke <body> karena beberapa halaman
 * membungkus isinya dalam elemen ber-transform, yang akan mengurung `fixed`.
 */
export default function Dialog({
  open,
  title,
  description,
  onClose,
  size = "md",
  artImage,
  children,
}: DialogProps) {
  const locale = useLocale();
  const t = strings[locale].common;
  // Portal baru dipasang setelah mount supaya markup server dan klien cocok.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

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

  if (!mounted) return null;

  const split = artImage !== undefined;
  const maxWidth = split ? "max-w-3xl" : size === "lg" ? "max-w-2xl" : "max-w-md";

  const header = (
    <div className={split ? "space-y-1" : "px-10 text-center"}>
      <h2 className="font-display text-xl font-bold text-frost">{title}</h2>
      {description && (
        <p className={`text-sm leading-relaxed text-ice/55 ${split ? "" : "mx-auto max-w-sm"}`}>{description}</p>
      )}
    </div>
  );

  return createPortal(
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
            tabIndex={-1}
            ref={(node) => node?.focus()}
            className={`relative w-full ${maxWidth} max-h-[88vh] overflow-hidden rounded-3xl border border-white/12 bg-night/95 shadow-2xl shadow-black/60 outline-none`}
            initial={{ opacity: 0, scale: 0.88, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 12 }}
            transition={{ type: "spring", stiffness: 380, damping: 28 }}
          >
            <button
              type="button"
              onClick={onClose}
              aria-label={t.close}
              title={t.close}
              className="absolute right-4 top-4 z-20 grid size-10 place-items-center rounded-full bg-night/50 text-ice/70 backdrop-blur-sm transition-colors hover:bg-white/15 hover:text-frost focus-visible:bg-white/15 focus-visible:text-frost focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-frost/60 active:scale-95"
            >
              <LuX aria-hidden className="size-5" />
            </button>

            {split ? (
              <div className="grid max-h-[88vh] sm:grid-cols-[minmax(0,40%)_minmax(0,1fr)]">
                {/* Kolom art: penuh tinggi di desktop, strip di mobile supaya
                    kolom aksi tidak terdorong keluar layar. */}
                <div className="relative h-32 sm:h-auto">
                  <Image
                    src={artImage}
                    alt=""
                    fill
                    sizes="(max-width: 640px) 100vw, 320px"
                    className="object-cover object-top"
                  />
                  <div
                    aria-hidden
                    className="absolute inset-0 bg-gradient-to-t from-night via-night/25 to-transparent sm:bg-gradient-to-r sm:from-transparent sm:via-night/10 sm:to-night"
                  />
                </div>

                <div className="space-y-5 overflow-y-auto p-5 pr-14 sm:p-6 sm:pr-14">
                  {header}
                  {children}
                </div>
              </div>
            ) : (
              <div className="max-h-[88vh] space-y-4 overflow-y-auto p-5 sm:p-6">
                {header}
                {children}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

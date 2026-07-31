"use client";

import { motion } from "motion/react";

import BingoLetters from "@/components/BingoLetters";
import { useLocale } from "@/hooks/useLocale";
import { strings } from "@/i18n/strings";

export interface MatchResultPlayer {
  readonly playerId: string;
  readonly nickname: string;
}

export interface MatchResultProps {
  readonly winnerId: string | null;
  readonly reason?: string;
  readonly players: readonly MatchResultPlayer[];
  readonly onBackToLanding: () => void;
  readonly onPlayAgain?: () => void;
}

const REASON_KEY: Record<string, "reasonPlayerLeft" | "reasonPlayerDisconnected"> = {
  player_left: "reasonPlayerLeft",
  player_disconnected: "reasonPlayerDisconnected",
};

/**
 * Dumb: layar match:ended - pemenang (atau alasan match dibatalkan), rematch,
 * dan jalan pulang.
 *
 * Dibuat sebagai momen, bukan sekadar notifikasi (BRIEF.md §4 P1 "layar
 * menang/kalah yang layak di-screenshot"): panel masuk dengan spring, huruf
 * B-I-N-G-O menyala penuh, nama pemenang jadi elemen terbesar. Match yang
 * batal tidak ikut dirayakan - tidak ada yang menang di situ.
 */
export default function MatchResult({ winnerId, reason, players, onBackToLanding, onPlayAgain }: MatchResultProps) {
  const locale = useLocale();
  const t = strings[locale].play.result;
  const winner = winnerId ? players.find((p) => p.playerId === winnerId) : undefined;
  const reasonKey = reason ? REASON_KEY[reason] : undefined;

  return (
    <motion.section
      initial={{ opacity: 0, scale: 0.92, y: 16 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 320, damping: 26 }}
      className={`relative overflow-hidden rounded-3xl border p-5 text-center backdrop-blur-md sm:p-8 ${
        winnerId ? "border-frost/30 bg-gradient-to-b from-glacier-deep/50 to-night" : "border-white/10 bg-night/60"
      }`}
    >
      {winnerId && (
        <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-24 h-48 bg-frost/20 blur-3xl" />
      )}

      <div className="relative space-y-5">
        <h2 className="font-display text-xl font-bold uppercase tracking-[0.15em] text-frost/70 sm:text-2xl sm:tracking-[0.2em]">
          {t.title}
        </h2>

        {winnerId ? (
          <>
            <motion.div
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.12, type: "spring", stiffness: 300, damping: 18 }}
              className="flex justify-center"
            >
              <BingoLetters count={5} />
            </motion.div>

            <div className="space-y-1">
              <p className="text-xs uppercase tracking-wide text-ice/45">{t.winner}</p>
              <p className="break-words font-display text-2xl font-bold text-frost sm:text-4xl">
                {winner?.nickname ?? winnerId}
              </p>
            </div>
          </>
        ) : (
          <p className="text-sm text-ice/60">
            {t.noWinner}
            {reasonKey ? ` · ${t[reasonKey]}` : reason ? ` · ${reason}` : ""}
          </p>
        )}

        <div className="flex flex-wrap justify-center gap-2 pt-1">
          {onPlayAgain && (
            <button
              type="button"
              onClick={onPlayAgain}
              className="rounded-full bg-glacier-deep px-8 py-2.5 font-display text-base font-bold text-frost shadow-lg shadow-glacier-deep/40 transition-colors hover:bg-glacier"
            >
              {t.playAgain}
            </button>
          )}
          <button
            type="button"
            onClick={onBackToLanding}
            className="rounded-full border border-white/15 px-6 py-2.5 font-display text-base font-semibold text-ice transition-colors hover:border-white/35 hover:text-frost"
          >
            {strings[locale].common.back}
          </button>
        </div>
      </div>
    </motion.section>
  );
}

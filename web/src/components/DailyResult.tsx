import { useLocale } from "@/hooks/useLocale";
import { strings } from "@/i18n/strings";

export interface DailyResultProps {
  readonly number: number;
  readonly score: number;
  readonly callsToBingo: number;
  readonly shareCard: string;
  readonly copied: boolean;
  readonly onCopy: () => void;
}

/** Dumb: Daily Challenge result - score, calls-to-bingo, and the share card text with a copy-to-clipboard action. */
export default function DailyResult({ number, score, callsToBingo, shareCard, copied, onCopy }: DailyResultProps) {
  const locale = useLocale();
  const t = strings[locale].daily.result;

  return (
    <section className="mx-auto max-w-xs space-y-4 rounded-2xl border border-white/10 bg-night/45 p-4 text-center backdrop-blur-md">
      <h2 className="font-display text-lg font-bold text-frost">
        {t.title} #{number}
      </h2>

      <dl className="grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-white/5 py-3">
          <dt className="text-[0.65rem] uppercase tracking-wide text-ice/50">{t.score}</dt>
          <dd className="font-display text-2xl font-bold text-frost">{score}</dd>
        </div>
        <div className="rounded-xl bg-white/5 py-3">
          <dt className="text-[0.65rem] uppercase tracking-wide text-ice/50">{t.callsToBingo}</dt>
          <dd className="font-display text-2xl font-bold text-frost">{callsToBingo}</dd>
        </div>
      </dl>

      <div className="space-y-2">
        <h3 className="font-display text-xs font-semibold text-ice/60">{t.shareCardTitle}</h3>
        {/* Grid emoji-nya aset viral - tetap dibuat lega supaya enak di-screenshot. */}
        <pre className="whitespace-pre-wrap rounded-xl bg-night/60 p-3 text-center font-mono text-sm leading-relaxed text-frost">
          {shareCard}
        </pre>
        <button
          type="button"
          onClick={onCopy}
          className="rounded-full bg-frost px-5 py-1.5 font-display text-xs font-bold text-glacier-ink transition-opacity hover:opacity-85"
        >
          {strings[locale].common.copy}
        </button>
        {copied && <p className="text-xs text-ice/60">{strings[locale].common.copied}</p>}
      </div>
    </section>
  );
}

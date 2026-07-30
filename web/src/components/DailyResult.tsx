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
    <section className="space-y-3 rounded border border-slate-800 bg-slate-900/60 p-4">
      <h2 className="text-lg font-bold">
        {t.title} #{number}
      </h2>
      <dl className="flex gap-6">
        <div>
          <dt className="text-xs uppercase text-slate-400">{t.score}</dt>
          <dd className="text-2xl font-bold text-emerald-400">{score}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-slate-400">{t.callsToBingo}</dt>
          <dd className="text-2xl font-bold">{callsToBingo}</dd>
        </div>
      </dl>

      <div>
        <h3 className="mb-1 text-sm font-semibold text-slate-300">{t.shareCardTitle}</h3>
        <pre className="whitespace-pre-wrap rounded border border-slate-700 bg-slate-950 p-3 font-mono text-sm leading-relaxed">
          {shareCard}
        </pre>
        <button
          type="button"
          onClick={onCopy}
          className="mt-2 rounded bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-500"
        >
          {strings[locale].common.copy}
        </button>
        {copied && <p className="mt-1 text-xs text-emerald-400">{strings[locale].common.copied}</p>}
      </div>
    </section>
  );
}

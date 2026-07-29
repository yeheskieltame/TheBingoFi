import { strings } from "@/i18n/strings";

const locale = "id";

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
  const t = strings[locale].daily.result;

  return (
    <section>
      <h2>
        {t.title} #{number}
      </h2>
      <dl>
        <dt>{t.score}</dt>
        <dd>{score}</dd>
        <dt>{t.callsToBingo}</dt>
        <dd>{callsToBingo}</dd>
      </dl>

      <h3>{t.shareCardTitle}</h3>
      <pre>{shareCard}</pre>
      <button type="button" onClick={onCopy}>
        {strings[locale].common.copy}
      </button>
      {copied && <p>{strings[locale].common.copied}</p>}
    </section>
  );
}

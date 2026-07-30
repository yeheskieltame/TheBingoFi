"use client";

import { useLocale } from "@/hooks/useLocale";
import { strings } from "@/i18n/strings";

export interface NicknameFieldProps {
  readonly id: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
}

/**
 * Dumb: input nickname + hint "isi dulu". Dulu berdiri sendiri di hero landing,
 * padahal nickname baru dibutuhkan tepat sebelum masuk match - jadi sekarang
 * ikut di dalam tiap modal mode (dan baris gabung-via-kode), di sebelah tombol
 * yang membutuhkannya. Nilainya tetap satu sumber di lib/storage.ts, jadi cukup
 * diisi sekali.
 */
export default function NicknameField({ id, value, onChange }: NicknameFieldProps) {
  const locale = useLocale();
  const t = strings[locale].landing;
  const empty = value.trim().length === 0;

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-xs uppercase tracking-wide text-ice/45">
        {t.nicknameLabel}
      </label>
      <input
        id={id}
        name="nickname"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={t.nicknamePlaceholder}
        autoComplete="nickname"
        className="w-full rounded-full border border-white/15 bg-night/60 px-4 py-2.5 font-display text-sm font-medium text-frost placeholder:text-ice/35 focus:border-white/35 focus:outline-none"
      />
      {empty && <p className="text-xs text-amber-200/90">{t.nicknameRequiredHint}</p>}
    </div>
  );
}

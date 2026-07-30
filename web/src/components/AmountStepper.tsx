"use client";

export interface AmountStepperProps {
  readonly id: string;
  readonly label: string;
  readonly value: number;
  readonly max: number;
  readonly disabled?: boolean;
  readonly onChange: (amount: number) => void;
}

/**
 * Dumb: pemilih jumlah beli. Spinner bawaan `input[type=number]` terlalu kecil
 * untuk disentuh dan tampilannya beda-beda tiap browser, jadi tombol −/+ dibuat
 * sendiri; input-nya tetap `type=number` supaya keyboard angka di HP dan
 * ketik-manual tetap jalan.
 *
 * Clamp ada di sini (1..max) sehingga pemanggil tidak perlu mengulang aturan
 * yang sama di /market dan di dialog detail.
 */
export default function AmountStepper({ id, label, value, max, disabled, onChange }: AmountStepperProps) {
  const clamp = (next: number) => Math.min(Math.max(1, next), Math.max(1, max));

  return (
    <div className="flex items-center overflow-hidden rounded-full border border-white/20 bg-night/70">
      <button
        type="button"
        aria-label={`${label} −`}
        disabled={disabled || value <= 1}
        onClick={() => onChange(clamp(value - 1))}
        className="grid size-8 place-items-center font-display text-base font-bold text-ice transition-colors hover:text-frost disabled:cursor-not-allowed disabled:opacity-25"
      >
        −
      </button>

      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={1}
        max={Math.max(1, max)}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(clamp(Number(event.target.value) || 1))}
        /* appearance-none: spinner bawaan dimatikan, tombol −/+ di atas yang dipakai. */
        className="w-9 [appearance:textfield] bg-transparent text-center font-display text-sm font-bold text-frost outline-none disabled:opacity-40 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />

      <button
        type="button"
        aria-label={`${label} +`}
        disabled={disabled || value >= max}
        onClick={() => onChange(clamp(value + 1))}
        className="grid size-8 place-items-center font-display text-base font-bold text-ice transition-colors hover:text-frost disabled:cursor-not-allowed disabled:opacity-25"
      >
        +
      </button>
    </div>
  );
}

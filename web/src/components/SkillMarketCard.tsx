import { formatEther } from "viem";

import { useLocale } from "@/hooks/useLocale";
import type { SkillCatalogEntry } from "@/hooks/useSkillCatalog";
import type { SaleInfo } from "@/hooks/useMarketplaceSales";
import { strings } from "@/i18n/strings";
import { explorerTxUrl } from "@/lib/chain";

export type BuyStatus = "idle" | "submitting" | "confirming" | "success" | "error";

export interface SkillMarketCardProps {
  readonly entry: SkillCatalogEntry;
  readonly sale: SaleInfo | undefined;
  readonly ownedBalance: bigint;
  readonly amount: number;
  readonly onAmountChange: (amount: number) => void;
  readonly walletConnected: boolean;
  readonly buyDisabled: boolean;
  readonly buyStatus: BuyStatus;
  readonly buyError: string | null;
  readonly txHash: string | undefined;
  readonly onBuy: () => void;
}

/** Dumb: one skill's marketplace listing - catalog metadata + on-chain sale (price/stock) + your balance + a simple amount picker and buy action. Used by /market's page.tsx, which owns all the on-chain reads/writes. */
export default function SkillMarketCard({
  entry,
  sale,
  ownedBalance,
  amount,
  onAmountChange,
  walletConnected,
  buyDisabled,
  buyStatus,
  buyError,
  txHash,
  onBuy,
}: SkillMarketCardProps) {
  const locale = useLocale();
  const t = strings[locale].market;
  // Typed as Record<string, string>, see LoadoutPicker.tsx's same note.
  const effectNames: Record<string, string> = strings[locale].play.skills.effectNames;

  const remaining = sale ? sale.maxSupply - sale.minted : 0n;
  const soldOut = sale ? remaining <= 0n : false;
  const canBuy = walletConnected && sale?.active && !soldOut && entry.active;

  return (
    <li className="space-y-2 rounded border border-slate-800 bg-slate-900/60 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold text-white">{effectNames[entry.effectType] ?? entry.effectType}</h3>
          <p className="text-xs text-slate-400">
            #{entry.skillId} · {t.rarity} {entry.rarity}
          </p>
        </div>
        {!entry.active && <span className="rounded bg-slate-700 px-2 py-0.5 text-xs">{t.inactive}</span>}
      </div>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-300">
        <dt className="text-slate-500">{t.charges}</dt>
        <dd>{entry.charges}</dd>
        <dt className="text-slate-500">{t.cooldown}</dt>
        <dd>{entry.cooldown}</dd>
        <dt className="text-slate-500">{t.maxPerLoadout}</dt>
        <dd>{entry.maxPerLoadout}</dd>
        <dt className="text-slate-500">{t.yourBalance}</dt>
        <dd>{ownedBalance.toString()}</dd>
      </dl>

      {sale ? (
        <div className="space-y-1 text-sm">
          <p>
            {t.price}: <span className="font-semibold">{formatEther(sale.price)} ETH</span>
          </p>
          <p className={soldOut ? "text-red-400" : "text-slate-300"}>
            {t.stock}: {soldOut ? t.soldOut : `${remaining.toString()} / ${sale.maxSupply.toString()}`}
          </p>
        </div>
      ) : (
        <p className="text-xs text-slate-500">{t.loading}</p>
      )}

      <div className="flex items-center gap-2">
        <label htmlFor={`amount-${entry.skillId}`} className="text-xs text-slate-400">
          {t.amountLabel}
        </label>
        <input
          id={`amount-${entry.skillId}`}
          type="number"
          min={1}
          max={Math.max(1, Number(remaining > 0n ? remaining : 1n))}
          value={amount}
          onChange={(event) => onAmountChange(Math.max(1, Number(event.target.value) || 1))}
          disabled={!canBuy}
          className="w-20 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm disabled:opacity-50"
        />
        <button
          type="button"
          onClick={onBuy}
          disabled={!canBuy || buyDisabled}
          className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {buyStatus === "submitting" ? t.buying : buyStatus === "confirming" ? t.confirming : t.buy}
        </button>
      </div>

      {!walletConnected && <p className="text-xs text-amber-400">{t.connectPrompt}</p>}
      {buyStatus === "success" && txHash && (
        <p className="text-xs text-emerald-400">
          {t.buySuccess} —{" "}
          <a href={explorerTxUrl(txHash)} target="_blank" rel="noreferrer" className="underline">
            {t.viewTx}
          </a>
        </p>
      )}
      {buyStatus === "error" && buyError && (
        <p role="alert" className="text-xs text-red-400">
          {t.buyError}: {buyError}
        </p>
      )}
    </li>
  );
}

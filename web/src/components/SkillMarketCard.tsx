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
    <li className="space-y-2.5 rounded-2xl border border-white/10 bg-night/45 p-4 backdrop-blur-md">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-display text-base font-bold text-frost">{effectNames[entry.effectType] ?? entry.effectType}</h3>
          <p className="text-xs text-ice/55">
            #{entry.skillId} · {t.rarity} {entry.rarity}
          </p>
        </div>
        {!entry.active && <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs text-ice">{t.inactive}</span>}
      </div>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-frost/80">
        <dt className="text-ice/45">{t.charges}</dt>
        <dd>{entry.charges}</dd>
        <dt className="text-ice/45">{t.cooldown}</dt>
        <dd>{entry.cooldown}</dd>
        <dt className="text-ice/45">{t.maxPerLoadout}</dt>
        <dd>{entry.maxPerLoadout}</dd>
        <dt className="text-ice/45">{t.yourBalance}</dt>
        <dd>{ownedBalance.toString()}</dd>
      </dl>

      {sale ? (
        <div className="space-y-1 text-sm">
          <p>
            {t.price}: <span className="font-display font-bold text-frost">{formatEther(sale.price)} ETH</span>
          </p>
          <p className={soldOut ? "text-red-300" : "text-frost/70"}>
            {t.stock}: {soldOut ? t.soldOut : `${remaining.toString()} / ${sale.maxSupply.toString()}`}
          </p>
        </div>
      ) : (
        <p className="text-xs text-ice/45">{t.loading}</p>
      )}

      <div className="flex items-center gap-2">
        <label htmlFor={`amount-${entry.skillId}`} className="text-xs text-ice/55">
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
          className="w-16 rounded-full border border-white/15 bg-night/60 px-3 py-1 text-center text-sm text-frost disabled:opacity-40"
        />
        <button
          type="button"
          onClick={onBuy}
          disabled={!canBuy || buyDisabled}
          className="ml-auto rounded-full bg-glacier-deep px-5 py-1.5 font-display text-sm font-bold text-frost transition-colors hover:bg-glacier disabled:cursor-not-allowed disabled:opacity-40"
        >
          {buyStatus === "submitting" ? t.buying : buyStatus === "confirming" ? t.confirming : t.buy}
        </button>
      </div>

      {!walletConnected && <p className="text-xs text-amber-200">{t.connectPrompt}</p>}
      {buyStatus === "success" && txHash && (
        <p className="text-xs text-frost">
          {t.buySuccess} ·{" "}
          <a href={explorerTxUrl(txHash)} target="_blank" rel="noreferrer" className="underline">
            {t.viewTx}
          </a>
        </p>
      )}
      {buyStatus === "error" && buyError && (
        <p role="alert" className="text-xs text-red-300">
          {t.buyError}: {buyError}
        </p>
      )}
    </li>
  );
}

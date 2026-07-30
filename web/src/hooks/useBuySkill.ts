"use client";

import { useCallback } from "react";
import { useWaitForTransactionReceipt, useWriteContract } from "wagmi";

import { contractAddresses, marketplaceAbi } from "@/lib/chain";

/**
 * Buffer sent on top of the quoted unit price (contracts/README.md's
 * Dynamic Pricing section + task brief: "value = quote * amount * 1.02").
 * Price can drift between quoting (hooks/useSkillPrices.ts's `priceOf`) and
 * the tx actually executing (another buyer's purchase, or plain demand
 * decay/scarcity ramp ticking with time) - the contract computes the real
 * `unitPrice` once from on-chain state at execution and auto-refunds
 * whatever of `msg.value` wasn't needed (CEI, see contracts/README.md's
 * "Alur pembelian"), so overpaying by up to 2% here is always safe, never
 * lost.
 */
const BUY_BUFFER_BPS = 10_200n;
const BPS_DENOMINATOR = 10_000n;

/**
 * Wraps Marketplace.buy(skillId, amount) - payable, `msg.value` should be
 * `priceOf(skillId) * amount` plus a small buffer (see BUY_BUFFER_BPS
 * above); `priceWei` here MUST come from `priceOf`, never `sales().basePrice`
 * (contracts/README.md's "Fungsi yang Dipanggil Frontend"). Exposes the
 * wagmi write + receipt-wait lifecycle as one simple status so /market
 * doesn't need to juggle two hooks' worth of pending/success/error state.
 */
export function useBuySkill() {
  const { writeContractAsync, data: hash, error: writeError, isPending: isSubmitting, reset } = useWriteContract();
  const {
    isLoading: isConfirming,
    isSuccess: isConfirmed,
    error: receiptError,
  } = useWaitForTransactionReceipt({ hash });

  const buy = useCallback(
    async (skillId: number, amount: number, quotedUnitPriceWei: bigint) => {
      const value = (quotedUnitPriceWei * BigInt(amount) * BUY_BUFFER_BPS) / BPS_DENOMINATOR;
      await writeContractAsync({
        address: contractAddresses.marketplace,
        abi: marketplaceAbi,
        functionName: "buy",
        args: [BigInt(skillId), BigInt(amount)],
        value,
      });
    },
    [writeContractAsync],
  );

  const error = writeError ?? receiptError;

  return {
    buy,
    hash,
    isSubmitting,
    isConfirming,
    isConfirmed,
    error: error ? error.message : null,
    reset,
  };
}

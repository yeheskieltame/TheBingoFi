"use client";

import { useCallback } from "react";
import { useWaitForTransactionReceipt, useWriteContract } from "wagmi";

import { contractAddresses, marketplaceAbi } from "@/lib/chain";

/**
 * Wraps Marketplace.buy(skillId, amount) - payable, msg.value must equal
 * price * amount exactly (contracts/README.md's "Fungsi yang Dipanggil
 * Frontend"). Exposes the wagmi write + receipt-wait lifecycle as one
 * simple status so /market doesn't need to juggle two hooks' worth of
 * pending/success/error state.
 */
export function useBuySkill() {
  const { writeContractAsync, data: hash, error: writeError, isPending: isSubmitting, reset } = useWriteContract();
  const {
    isLoading: isConfirming,
    isSuccess: isConfirmed,
    error: receiptError,
  } = useWaitForTransactionReceipt({ hash });

  const buy = useCallback(
    async (skillId: number, amount: number, priceWei: bigint) => {
      await writeContractAsync({
        address: contractAddresses.marketplace,
        abi: marketplaceAbi,
        functionName: "buy",
        args: [BigInt(skillId), BigInt(amount)],
        value: priceWei * BigInt(amount),
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

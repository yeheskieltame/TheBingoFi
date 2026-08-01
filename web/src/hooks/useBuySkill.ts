"use client";

import { useCallback } from "react";
import { useWaitForTransactionReceipt, useWriteContract } from "wagmi";

import { contractAddresses, marketplaceAbi, publicClient } from "@/lib/chain";

/**
 * Buffer sent on top of the quoted unit price. The contract computes the
 * real `unitPrice` once from on-chain state at execution and auto-refunds
 * whatever of `msg.value` wasn't needed (CEI, see contracts/README.md's
 * "Alur pembelian"), so overpaying here is always safe, never lost.
 *
 * 10% and not 2%: the dominant source of drift is NOT the scarcity ramp
 * (which moves a fraction of a percent per unit on a 1000-supply drop) but
 * the demand-decay discount RESETTING. A sale sitting at a 10% discount
 * jumps straight back to full price the moment anyone buys, so the next
 * buyer's quote is instantly ~11% stale and a 2% buffer reverts. Observed
 * live on GIWA Sepolia: 0.00045045 -> 0.000501 right after one purchase.
 * The refetch below removes most of this window; the buffer covers the rest.
 */
const BUY_BUFFER_BPS = 11_000n;
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
      // Quote ulang tepat sebelum kirim. Harga di layar bisa berumur sampai
      // 30 detik (useSkillPrices refetch), dan satu pembelian orang lain di
      // sela itu sudah cukup membuatnya basi (lihat catatan buffer di atas).
      // Kalau pembacaan gagal, pakai harga di layar: buffer masih menutupi
      // kasus umum, dan menggagalkan pembelian karena satu RPC meleset itu
      // lebih buruk daripada mencoba.
      let unitPrice = quotedUnitPriceWei;
      try {
        unitPrice = (await publicClient.readContract({
          address: contractAddresses.marketplace,
          abi: marketplaceAbi,
          functionName: "priceOf",
          args: [BigInt(skillId)],
        })) as bigint;
      } catch {
        // biarkan pakai quote dari layar
      }
      const value = (unitPrice * BigInt(amount) * BUY_BUFFER_BPS) / BPS_DENOMINATOR;
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

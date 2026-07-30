"use client";

import { useCallback } from "react";
import { useAccount, useConnect, useDisconnect, useSignMessage, useSwitchChain } from "wagmi";

import { giwaSepolia } from "@/lib/chain";

/**
 * Thin wrapper around wagmi's connection hooks - injected-connector-only
 * (see lib/chain.ts's wagmiConfig, no WalletConnect/cloud projectId), one
 * place for Header/play.lobby/market to read wallet state and sign
 * messages without each re-deriving "the" connector to use.
 */
export function useWallet() {
  const { address, isConnected, isConnecting, chainId } = useAccount();
  const { connect, connectors, isPending: isConnectPending, error: connectError } = useConnect();
  const { disconnect } = useDisconnect();
  const { signMessageAsync } = useSignMessage();
  const { switchChain, isPending: isSwitchPending } = useSwitchChain();

  const connector = connectors[0];
  const wrongNetwork = isConnected && chainId !== giwaSepolia.id;

  const connectWallet = useCallback(() => {
    if (connector) connect({ connector, chainId: giwaSepolia.id });
  }, [connect, connector]);

  const disconnectWallet = useCallback(() => disconnect(), [disconnect]);

  const switchToGiwaSepolia = useCallback(() => switchChain({ chainId: giwaSepolia.id }), [switchChain]);

  /** Signs `message` with the connected wallet - throws on rejection/failure, caller handles it. */
  const signMessage = useCallback((message: string) => signMessageAsync({ message }), [signMessageAsync]);

  return {
    address,
    isConnected,
    isConnecting: isConnecting || isConnectPending,
    chainId,
    hasConnector: connector !== undefined,
    wrongNetwork,
    isSwitchingNetwork: isSwitchPending,
    connectError: connectError ? connectError.message : null,
    connect: connectWallet,
    disconnect: disconnectWallet,
    switchToGiwaSepolia,
    signMessage,
  };
}

export type UseWalletReturn = ReturnType<typeof useWallet>;

"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { WagmiProvider } from "wagmi";

import { wagmiConfig } from "@/lib/chain";

/**
 * App-wide providers: wagmi (wallet connection, GIWA Sepolia - see
 * lib/chain.ts) + its required @tanstack/react-query client. Mounted once
 * in app/layout.tsx so every page can use wagmi hooks (Header's
 * connect/disconnect, /play's wallet link, /market's buy flow) without
 * re-wiring this per page.
 */
export default function Providers({ children }: { readonly children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}

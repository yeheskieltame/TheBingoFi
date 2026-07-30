import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isAddress } from "viem";

import ProfileView from "@/components/ProfileView";
import { truncateAddress } from "@/lib/chain";

interface ProfilePageProps {
  readonly params: Promise<{ readonly address: string }>;
}

/**
 * Public shareable profile (CONCEPT.md §7.4b: "/profile/<address> — koleksi
 * skill on-chain ... tiap share = akuisisi gratis"). Kept as a Server
 * Component (async, awaits `params`) so `generateMetadata` can run - the
 * Metadata API only works from Server Components (see Next's
 * generateMetadata docs). The actual on-chain reads + share buttons need
 * browser APIs (viem hooks, `window`/`navigator`), so they live in the
 * Client Component below, per Next's recommended "Server Component page +
 * Client Component body" split.
 */
export async function generateMetadata({ params }: ProfilePageProps): Promise<Metadata> {
  const { address } = await params;
  if (!isAddress(address)) {
    return { title: "Profil tidak ditemukan · TheBingoFi" };
  }

  const short = truncateAddress(address);
  const title = `Koleksi ${short} · TheBingoFi`;
  const description = `Koleksi Skill & Skin NFT ${short} di TheBingoFi. Bingo strategis, web2 gameplay, web3 ownership.`;

  return {
    title,
    description,
    openGraph: { title, description, type: "profile" },
    twitter: { card: "summary", title, description },
  };
}

export default async function ProfilePage({ params }: ProfilePageProps) {
  const { address } = await params;
  if (!isAddress(address)) notFound();

  return <ProfileView address={address} />;
}

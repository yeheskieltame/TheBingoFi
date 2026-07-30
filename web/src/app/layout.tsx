import type { Metadata } from "next";
import { Baloo_2, Geist_Mono, Nunito } from "next/font/google";
import "./globals.css";

import Header from "@/components/Header";
import Providers from "@/components/Providers";

/** Display: rounded & chunky ala game casual - judul, tombol, nav, chip (utility `font-display`). */
const baloo = Baloo_2({
  variable: "--font-baloo",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

/** Body: rounded juga (bukan grotesk netral) supaya teks kecil tetap satu keluarga rasa dengan display. */
const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
});

/** Mono dipertahankan untuk yang memang harus monospace: kode room, address wallet. */
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TheBingoFi",
  description: "Bingo strategis multiplayer — web2 gameplay, web3 ownership.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="id"
      className={`${nunito.variable} ${geistMono.variable} ${baloo.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-night font-sans text-slate-100">
        <Providers>
          <Header />
          <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">{children}</div>
        </Providers>
      </body>
    </html>
  );
}

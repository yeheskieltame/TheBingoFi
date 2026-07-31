import type { Metadata } from "next";
import Image from "next/image";
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
  description: "Strategic multiplayer bingo. Web2 gameplay, web3 ownership.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${nunito.variable} ${geistMono.variable} ${baloo.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col overflow-x-clip bg-night font-sans text-slate-100">
        {/* Latar art untuk SELURUH aplikasi. Dulu tiap halaman memasang sendiri,
            dan di /market ia terkurung: <main> memakai -translate-x-1/2 untuk
            full-bleed, dan elemen ber-transform jadi containing block untuk anak
            `fixed`, jadi latarnya ikut menyempit. Di layout (tanpa transform di
            atasnya) ia selalu seukuran viewport. */}
        <div aria-hidden className="fixed inset-0 -z-10">
          <Image
            src="/images/background/bg.webp"
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover object-top"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-night/45 via-night/80 to-night" />
        </div>

        <Providers>
          <Header />
          <div className="mx-auto w-full max-w-6xl flex-1 px-3 py-4 sm:px-6 sm:py-6">{children}</div>
        </Providers>
      </body>
    </html>
  );
}

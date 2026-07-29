export type Locale = "id" | "en";

export const strings = {
  id: {
    landing: {
      title: "TheBingoFi",
      tagline: "Bingo strategis — web2 gameplay, web3 ownership",
      ctaGuest: "Main sebagai Guest",
      ctaConnectWallet: "Connect Wallet",
    },
  },
  en: {
    landing: {
      title: "TheBingoFi",
      tagline: "Strategic bingo — web2 gameplay, web3 ownership",
      ctaGuest: "Play as Guest",
      ctaConnectWallet: "Connect Wallet",
    },
  },
} satisfies Record<Locale, { landing: Record<string, string> }>;

export type Strings = typeof strings;

export type Locale = "id" | "en";

/**
 * Exported (rather than kept private) so components that look up a string
 * by a dynamic key (e.g. SkillPanel indexing `effectNames` by a runtime
 * `effectType`) can annotate their local `t` with this - `strings` itself
 * stays narrowly-typed to its literal object shape (that's the point of
 * `satisfies` below), which TS won't let you index with a plain `string`.
 */
export interface LocaleStrings {
  common: Record<string, string>;
  nav: Record<string, string>;
  wallet: Record<string, string>;
  landing: Record<string, string>;
  play: {
    title: string;
    connecting: string;
    leaveRoom: string;
    roomCodeLabel: string;
    lobby: Record<string, string>;
    draft: Record<string, string>;
    match: Record<string, string>;
    result: Record<string, string>;
    quests: Record<string, string>;
    skills: {
      title: string;
      yourSkills: string;
      use: string;
      chargesLeft: string;
      selectPrompt: Record<string, string>;
      cancelSelection: string;
      armedDoublePrefix: string;
      armedDoubleSuffix: string;
      armedGhost: string;
      pendingLabel: string;
      nullify: string;
      pass: string;
      historyTitle: string;
      wasNullified: string;
      wasResolved: string;
      effectNames: Record<string, string>;
    };
  };
  daily: {
    title: string;
    challengeNumber: string;
    nicknameLabel: string;
    play: string;
    result: Record<string, string>;
    leaderboard: Record<string, string>;
  };
  quests: {
    title: string;
    loading: string;
    noPlayerYet: string;
    table: Record<string, string>;
  };
  market: Record<string, string>;
}

export const strings = {
  id: {
    common: {
      loading: "Memuat...",
      copy: "Salin",
      copied: "Tersalin",
      back: "Kembali ke Beranda",
      dismiss: "Tutup",
      retry: "Coba Lagi",
      close: "Tutup",
    },
    nav: {
      home: "Beranda",
      play: "Main",
      daily: "Daily Challenge",
      quests: "Quests",
      market: "Marketplace",
      langToggle: "EN",
    },
    wallet: {
      connect: "Connect Wallet",
      connecting: "Menghubungkan...",
      disconnect: "Putuskan",
      notInstalled: "Wallet extension tidak terdeteksi (install MetaMask dkk)",
      wrongNetwork: "Jaringan salah",
      switchNetwork: "Pindah ke GIWA Sepolia",
      switching: "Berpindah jaringan...",
    },
    landing: {
      title: "TheBingoFi",
      tagline: "Bingo strategis — web2 gameplay, web3 ownership",
      nicknameLabel: "Nickname",
      createRoom: "Buat Room",
      joinCodeLabel: "Kode Room",
      joinRoom: "Gabung via Kode",
      dailyLink: "Daily Challenge",
      questsLink: "Quests",
      marketLink: "Marketplace",
      modeLabel: "Mode Room",
      modeCasual: "Casual (tanpa skill)",
      modeStandard: "Standard (pakai skill NFT)",
      modeStandardHint: "Butuh wallet ter-link untuk pasang loadout — tetap bisa main tanpa skill kalau belum link.",
    },
    play: {
      title: "Room",
      connecting: "Menghubungkan ke room...",
      leaveRoom: "Keluar",
      roomCodeLabel: "Kode Room",
      lobby: {
        title: "Lobi",
        playersTitle: "Pemain",
        host: "Host",
        connected: "Terhubung",
        disconnected: "Terputus",
        submitted: "Board siap",
        waiting: "Menyusun board",
        startDraft: "Mulai Draft",
        needMorePlayers: "Butuh minimal 2 pemain untuk mulai draft",
        loadoutTitle: "Loadout Kamu",
        walletLabel: "Wallet",
        walletNotLinked: "Wallet belum di-link",
        loadoutLabel: "Skill id",
        loadoutEmpty: "belum diset",
        loadoutNote: "Pemain tanpa loadout tetap bisa main — main polos tanpa skill.",
        linkWallet: "Link Wallet ke Room",
        linkWalletPending: "Menghubungkan wallet...",
        walletLinked: "Wallet ter-link",
        connectFirst: "Connect wallet dulu lewat tombol di header, lalu link ke room ini.",
        loadoutPickerTitle: "Pilih Loadout (maks 2)",
        loadoutSave: "Simpan Loadout",
        loadoutSaving: "Menyimpan...",
        loadoutSaved: "Loadout tersimpan",
        loadoutNoneOwned: "Kamu belum punya skill NFT — beli di Marketplace, atau main tanpa skill.",
        loadoutCatalogLoading: "Memuat katalog skill...",
        loadoutCatalogError: "Gagal memuat katalog skill",
        loadoutOwnedLabel: "dimiliki",
        loadoutNotOwnedLabel: "belum dimiliki",
        loadoutPlayersTitle: "Loadout Semua Pemain",
        loadoutNone: "tanpa skill",
        roomCodeCopy: "Salin Kode",
        roomCodeCopied: "Kode disalin",
      },
      draft: {
        title: "Susun Board",
        instructions: "Klik dua sel untuk menukar posisi angka.",
        shuffle: "Acak",
        lockBoard: "Kunci Board",
        locked: "Board sudah dikunci, menunggu pemain lain...",
      },
      match: {
        title: "Main",
        yourBoard: "Board Kamu",
        calledNumbers: "Angka Terpanggil",
        noCallsYet: "Belum ada angka dipanggil",
        currentTurn: "Giliran",
        yourTurn: "Giliran kamu — pilih angka",
        waitingTurn: "Menunggu giliran pemain lain",
        callNumber: "Panggil Angka",
        playersTitle: "Pemain",
        lines: "Garis",
      },
      result: {
        title: "Selesai",
        winner: "Pemenang",
        noWinner: "Tidak ada pemenang",
        reasonPlayerLeft: "Pemain keluar dari room",
        reasonPlayerDisconnected: "Pemain terputus",
        playAgain: "Main Lagi",
      },
      quests: {
        title: "Quest Selesai",
        empty: "Belum ada quest selesai di sesi ini",
      },
      skills: {
        title: "Skill",
        yourSkills: "Skill Kamu",
        use: "Pakai",
        chargesLeft: "sisa charge",
        selectPrompt: {
          WILD_DAUB: "Pilih 1 sel di board kamu untuk di-daub",
          CELL_SWAP: "Pilih 2 sel di board kamu untuk ditukar",
        },
        cancelSelection: "Batal",
        armedDoublePrefix: "Double Call aktif — panggil ",
        armedDoubleSuffix: " angka giliran ini",
        armedGhost: "Ghost Call aktif — panggilan berikutnya hanya tertandai di board kamu",
        pendingLabel: "Menunggu keputusan Nullify",
        nullify: "Nullify",
        pass: "Biarkan",
        historyTitle: "Riwayat Skill",
        wasNullified: "dibatalkan (Nullify)",
        wasResolved: "berhasil",
        effectNames: {
          WILD_DAUB: "Wild Daub",
          DOUBLE_CALL: "Double Call",
          GHOST_CALL: "Ghost Call",
          CELL_SWAP: "Cell Swap",
          NULLIFY: "Nullify",
        },
      },
    },
    daily: {
      title: "Daily Challenge",
      challengeNumber: "Tantangan",
      nicknameLabel: "Nickname",
      play: "Mainkan",
      result: {
        title: "Hasil",
        score: "Skor",
        callsToBingo: "Call ke Bingo",
        shareCardTitle: "Share Card",
      },
      leaderboard: {
        title: "Leaderboard",
        rank: "#",
        nickname: "Nickname",
        score: "Skor",
        callsToBingo: "Call",
        empty: "Belum ada skor hari ini",
      },
    },
    quests: {
      title: "Quests",
      loading: "Memuat quest...",
      noPlayerYet: "Main room dulu untuk melihat progress quest kamu.",
      table: {
        title: "Judul",
        target: "Target",
        window: "Periode",
        reward: "Reward XP",
        progress: "Progress",
      },
    },
    market: {
      title: "Marketplace",
      subtitle: "Beli Skill & Skin NFT — kosmetik & aksi in-match, bukan pay-to-win.",
      connectPrompt: "Connect wallet untuk membeli. Katalog tetap bisa dilihat tanpa wallet.",
      loading: "Memuat katalog...",
      error: "Gagal memuat data marketplace",
      empty: "Belum ada skill terdaftar",
      price: "Harga",
      stock: "Stok",
      yourBalance: "Kamu punya",
      amountLabel: "Jumlah",
      buy: "Beli",
      buying: "Menunggu wallet...",
      confirming: "Menunggu konfirmasi tx...",
      buySuccess: "Pembelian berhasil",
      buyError: "Pembelian gagal",
      viewTx: "Lihat transaksi",
      soldOut: "Habis",
      inactive: "Tidak dijual",
      rarity: "Rarity",
      charges: "Charge/match",
      maxPerLoadout: "Maks per loadout",
      cooldown: "Cooldown",
    },
  },
  en: {
    common: {
      loading: "Loading...",
      copy: "Copy",
      copied: "Copied",
      back: "Back to home",
      dismiss: "Dismiss",
      retry: "Retry",
      close: "Close",
    },
    nav: {
      home: "Home",
      play: "Play",
      daily: "Daily Challenge",
      quests: "Quests",
      market: "Marketplace",
      langToggle: "ID",
    },
    wallet: {
      connect: "Connect Wallet",
      connecting: "Connecting...",
      disconnect: "Disconnect",
      notInstalled: "No wallet extension detected (install MetaMask or similar)",
      wrongNetwork: "Wrong network",
      switchNetwork: "Switch to GIWA Sepolia",
      switching: "Switching network...",
    },
    landing: {
      title: "TheBingoFi",
      tagline: "Strategic bingo — web2 gameplay, web3 ownership",
      nicknameLabel: "Nickname",
      createRoom: "Create Room",
      joinCodeLabel: "Room Code",
      joinRoom: "Join via Code",
      dailyLink: "Daily Challenge",
      questsLink: "Quests",
      marketLink: "Marketplace",
      modeLabel: "Room Mode",
      modeCasual: "Casual (no skills)",
      modeStandard: "Standard (uses skill NFTs)",
      modeStandardHint: "Needs a linked wallet to set a loadout — you can still play without one, no skills.",
    },
    play: {
      title: "Room",
      connecting: "Connecting to room...",
      leaveRoom: "Leave",
      roomCodeLabel: "Room Code",
      lobby: {
        title: "Lobby",
        playersTitle: "Players",
        host: "Host",
        connected: "Connected",
        disconnected: "Disconnected",
        submitted: "Board ready",
        waiting: "Drafting board",
        startDraft: "Start Draft",
        needMorePlayers: "Need at least 2 players to start the draft",
        loadoutTitle: "Your Loadout",
        walletLabel: "Wallet",
        walletNotLinked: "Wallet not linked",
        loadoutLabel: "Skill ids",
        loadoutEmpty: "not set",
        loadoutNote: "Players without a loadout can still play — no skills, no disadvantage.",
        linkWallet: "Link Wallet to Room",
        linkWalletPending: "Linking wallet...",
        walletLinked: "Wallet linked",
        connectFirst: "Connect a wallet via the header button first, then link it to this room.",
        loadoutPickerTitle: "Pick Loadout (max 2)",
        loadoutSave: "Save Loadout",
        loadoutSaving: "Saving...",
        loadoutSaved: "Loadout saved",
        loadoutNoneOwned: "You don't own any skill NFTs yet — buy some on the Marketplace, or play without skills.",
        loadoutCatalogLoading: "Loading skill catalog...",
        loadoutCatalogError: "Failed to load skill catalog",
        loadoutOwnedLabel: "owned",
        loadoutNotOwnedLabel: "not owned",
        loadoutPlayersTitle: "Everyone's Loadout",
        loadoutNone: "no skills",
        roomCodeCopy: "Copy Code",
        roomCodeCopied: "Code copied",
      },
      draft: {
        title: "Arrange Board",
        instructions: "Click two cells to swap their positions.",
        shuffle: "Shuffle",
        lockBoard: "Lock Board",
        locked: "Board locked, waiting for other players...",
      },
      match: {
        title: "Playing",
        yourBoard: "Your Board",
        calledNumbers: "Called Numbers",
        noCallsYet: "No numbers called yet",
        currentTurn: "Turn",
        yourTurn: "Your turn — pick a number",
        waitingTurn: "Waiting for other players",
        callNumber: "Call Number",
        playersTitle: "Players",
        lines: "Lines",
      },
      result: {
        title: "Finished",
        winner: "Winner",
        noWinner: "No winner",
        reasonPlayerLeft: "A player left the room",
        reasonPlayerDisconnected: "A player disconnected",
        playAgain: "Play Again",
      },
      quests: {
        title: "Quests Completed",
        empty: "No quests completed this session yet",
      },
      skills: {
        title: "Skills",
        yourSkills: "Your Skills",
        use: "Use",
        chargesLeft: "charges left",
        selectPrompt: {
          WILD_DAUB: "Pick 1 cell on your board to daub",
          CELL_SWAP: "Pick 2 cells on your board to swap",
        },
        cancelSelection: "Cancel",
        armedDoublePrefix: "Double Call armed — call ",
        armedDoubleSuffix: " numbers this turn",
        armedGhost: "Ghost Call armed — your next call only marks your own board",
        pendingLabel: "Awaiting a Nullify decision",
        nullify: "Nullify",
        pass: "Pass",
        historyTitle: "Skill History",
        wasNullified: "Nullified",
        wasResolved: "resolved",
        effectNames: {
          WILD_DAUB: "Wild Daub",
          DOUBLE_CALL: "Double Call",
          GHOST_CALL: "Ghost Call",
          CELL_SWAP: "Cell Swap",
          NULLIFY: "Nullify",
        },
      },
    },
    daily: {
      title: "Daily Challenge",
      challengeNumber: "Challenge",
      nicknameLabel: "Nickname",
      play: "Play",
      result: {
        title: "Result",
        score: "Score",
        callsToBingo: "Calls to Bingo",
        shareCardTitle: "Share Card",
      },
      leaderboard: {
        title: "Leaderboard",
        rank: "#",
        nickname: "Nickname",
        score: "Score",
        callsToBingo: "Calls",
        empty: "No scores today yet",
      },
    },
    quests: {
      title: "Quests",
      loading: "Loading quests...",
      noPlayerYet: "Play a room first to see your quest progress.",
      table: {
        title: "Title",
        target: "Target",
        window: "Window",
        reward: "Reward XP",
        progress: "Progress",
      },
    },
    market: {
      title: "Marketplace",
      subtitle: "Buy Skill & Skin NFTs — cosmetics & in-match actions, not pay-to-win.",
      connectPrompt: "Connect a wallet to buy. The catalog is viewable without one.",
      loading: "Loading catalog...",
      error: "Failed to load marketplace data",
      empty: "No skills listed yet",
      price: "Price",
      stock: "Stock",
      yourBalance: "You own",
      amountLabel: "Amount",
      buy: "Buy",
      buying: "Waiting for wallet...",
      confirming: "Waiting for tx confirmation...",
      buySuccess: "Purchase successful",
      buyError: "Purchase failed",
      viewTx: "View transaction",
      soldOut: "Sold out",
      inactive: "Not for sale",
      rarity: "Rarity",
      charges: "Charges/match",
      maxPerLoadout: "Max per loadout",
      cooldown: "Cooldown",
    },
  },
} satisfies Record<Locale, LocaleStrings>;

export type Strings = typeof strings;

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
  landing: {
    title: string;
    tagline: string;
    /** Hero kartu art di atas halaman (judul besar + satu kalimat pitch). */
    heroTitle: string;
    heroSubtitle: string;
    nicknameLabel: string;
    nicknamePlaceholder: string;
    nicknameRequiredHint: string;
    joinCodeLabel: string;
    /** Label baris "gabung via kode" di bawah kartu-kartu mode main. */
    joinPrompt: string;
    /** Tombol aksi utama di bawah kartu mode terpilih. */
    playNow: string;
    /** Label a11y untuk deretan kartu mode (radiogroup). */
    modePickerLabel: string;
    joinRoom: string;
    dailyLink: string;
    questsLink: string;
    marketLink: string;
    /** Quick Match (VS Player) card - CONCEPT.md §2b. */
    quickMatch: Record<string, string>;
    /** Room Browser card (room:list). */
    roomBrowser: Record<string, string>;
    /** Manual "Buat Room" card (room:create with maxPlayers/isPublic). */
    createRoom: Record<string, string>;
    /** VS Bot card (room:createBot). */
    vsBot: Record<string, string>;
  };
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
    subtitle: string;
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
    windowDaily: string;
    windowWeekly: string;
    windowSeason: string;
    groupDone: string;
    done: string;
    panelTitle: string;
    intro: string;
    goalLabel: string;
    warning: string;
  };
  market: Record<string, string>;
  plaza: Record<string, string>;
  profile: Record<string, string>;
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
      plaza: "Plaza",
      profile: "Profilku",
      profileConnectHint: "Connect wallet dulu untuk lihat profilmu",
      // langToggle/langFlag = bahasa yang SEDANG aktif (penanda, bukan tujuan).
      // Aksinya dijelaskan lewat langSwitch di aria-label/title tombol.
      langToggle: "ID",
      langFlag: "🇮🇩",
      langSwitch: "Ganti bahasa ke English",
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
      tagline: "Bingo strategis. Web2 gameplay, web3 ownership",
      heroTitle: "Susun Papanmu, Rebut BINGO",
      heroSubtitle: "Bingo turn-based. Strategi, bukan keberuntungan.",
      nicknameLabel: "Nickname",
      nicknameRequiredHint: "Isi nickname dulu untuk memilih mode main",
      nicknamePlaceholder: "Nickname kamu",
      joinCodeLabel: "Kode Room",
      joinRoom: "Gabung",
      joinPrompt: "Punya kode room?",
      playNow: "Main Sekarang",
      modePickerLabel: "Pilih mode main",
      dailyLink: "Daily Challenge",
      questsLink: "Quests",
      marketLink: "Marketplace",
      quickMatch: {
        title: "Quick Match (VS Player)",
        desc: "Cari lawan instan. Pilih jumlah pemain, draft mulai otomatis begitu room penuh.",
        sizeLabel: "Jumlah pemain",
      },
      roomBrowser: {
        title: "Room Terbuka",
        desc: "Room publik yang masih menunggu pemain, gabung 1 klik.",
        refresh: "Segarkan",
        loading: "Memuat daftar room...",
        error: "Gagal memuat daftar room",
        empty: "Belum ada room terbuka. Buat sendiri atau quick match.",
        join: "Gabung",
        modeCasual: "Casual",
        modeStandard: "Standard",
      },
      createRoom: {
        title: "Buat Room",
        desc: "Atur target pemain, mode, dan visibilitas sendiri.",
        targetPlayersLabel: "Target pemain",
        modeLabel: "Mode Room",
        modeCasual: "Casual (tanpa skill)",
        modeStandard: "Standard (pakai skill NFT)",
        modeStandardHint: "Butuh wallet ter-link untuk pasang loadout. Tetap bisa main tanpa skill kalau belum link.",
        visibilityLabel: "Visibilitas",
        visibilityPublic: "Publik (muncul di Room Terbuka)",
        visibilityPrivate: "Privat (kode saja)",
        submit: "Buat Room",
      },
      vsBot: {
        title: "VS Bot",
        desc: "Main solo lawan bot, mulai instan tanpa lobi.",
        levelLabel: "Level Bot",
        levelHint: "Lv1 santai → Lv10 brutal",
        questHint: "Kalahkan Lv1/3/5/7/10 untuk reward quest musiman",
      },
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
        loadoutNote: "Pemain tanpa loadout tetap bisa main, polos tanpa skill.",
        linkWallet: "Link Wallet ke Room",
        linkWalletPending: "Menghubungkan wallet...",
        walletLinked: "Wallet ter-link",
        connectFirst: "Connect wallet dulu lewat tombol di header, lalu link ke room ini.",
        loadoutPickerTitle: "Pilih Loadout (maks 2)",
        loadoutSave: "Simpan Loadout",
        loadoutSaving: "Menyimpan...",
        loadoutSaved: "Loadout tersimpan",
        loadoutNoneOwned: "Kamu belum punya skill NFT. Beli di Marketplace, atau main tanpa skill.",
        loadoutCatalogLoading: "Memuat katalog skill...",
        loadoutCatalogError: "Gagal memuat katalog skill",
        loadoutOwnedLabel: "dimiliki",
        loadoutNotOwnedLabel: "belum dimiliki",
        loadoutPlayersTitle: "Loadout Semua Pemain",
        loadoutNone: "tanpa skill",
        roomCodeCopy: "Salin Kode",
        roomCodeCopied: "Kode disalin",
        playersSuffix: "pemain",
        visibilityPublic: "Publik",
        visibilityPrivate: "Privat",
        waitingForPlayers: "Menunggu pemain",
        autoStartNote: "match mulai otomatis saat penuh",
        botBadge: "BOT",
      },
      draft: {
        title: "Susun Board",
        instructions: "Klik dua sel atau drag & drop untuk menukar posisi angka.",
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
        yourTurn: "Giliran kamu, pilih angka",
        waitingTurn: "Menunggu giliran pemain lain",
        callNumber: "Panggil Angka",
        callHint: "Giliranmu. Klik angka yang belum ter-mark di board-mu untuk memanggilnya.",
        bingoProgress: "Progres BINGO",
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
        armedDoublePrefix: "Double Call aktif, panggil ",
        armedDoubleSuffix: " angka giliran ini",
        armedGhost: "Ghost Call aktif, panggilan berikutnya hanya tertandai di board kamu",
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
      subtitle: "Satu puzzle per hari, sama untuk semua pemain. Makin sedikit call sampai 5 garis, makin tinggi skor.",
      challengeNumber: "Tantangan",
      nicknameLabel: "Nickname",
      play: "Mainkan",
      result: {
        title: "Hasil",
        score: "Skor",
        callsToBingo: "Call ke Bingo",
        shareCardTitle: "Share Card",
        // Kartu hasil yang dipajang untuk di-screenshot/dibagikan.
        shareHint: "Screenshot kartu ini, atau bagikan lewat tombol di bawah.",
        shareX: "Share ke X",
        shareTelegram: "Telegram",
        copyText: "Salin teks",
        shareText: "Aku selesai BINGO di call ke-",
        lines: "garis",
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
        reward: "XP",
        progress: "Progress",
      },
      // Label grup per window quest (data window-nya sendiri datang dari server).
      windowDaily: "Harian",
      windowWeekly: "Mingguan",
      windowSeason: "Musim",
      groupDone: "selesai",
      done: "Selesai",
      // Panel gaya "system window" (lihat components/QuestList.tsx).
      panelTitle: "Quest Info",
      intro: "[Quest hari ini sudah tiba.]",
      goalLabel: "Target",
      warning: "Quest harian di-reset tiap tengah malam UTC. Progres yang belum tuntas hangus.",
    },
    market: {
      title: "Marketplace",
      subtitle: "Beli Skill & Skin NFT. Kosmetik & aksi in-match, bukan pay-to-win.",
      heroTitle: "Koleksi skill, bukan keberuntungan",
      heroCta: "Lihat koleksi",
      spotlightLabel: "Sorotan",
      spotlightNote: "Supply paling terbatas di katalog.",
      catalogTitle: "Koleksi Skill",
      viewDetails: "Lihat detail",
      detailsTitle: "Detail skill",
      viewOnExplorer: "Lihat kontrak di explorer",
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
      discountBadge: "Diskon",
      premiumBadge: "Harga naik (laris)",
      stockRemaining: "Tersisa",
      stockOf: "dari",
      refundNote: "Kirim sedikit lebih (buffer 2%), kelebihan pembayaran dikembalikan otomatis oleh kontrak.",
      tierCommon: "Common",
      tierUncommon: "Uncommon",
      tierRare: "Rare",
      tierSuperRare: "Super Rare",
    },
    plaza: {
      title: "Plaza",
      subtitle: "Ruang diskusi global. Ngobrol strategi, cari lawan, pamer & promosikan koleksimu.",
      nicknamePrompt: "Isi nickname dulu untuk mulai chat di Plaza",
      nicknameLabel: "Nickname",
      nicknameSave: "Simpan",
      composerPlaceholder: "Ngobrol, pamerkan, atau jual koleksimu... mis. \"jual Wild Daub rare, cek profilku\"",
      send: "Kirim",
      attachSkillLabel: "Lampirkan skill",
      attachSkillNone: "Tanpa skill",
      connectForSkills: "Connect wallet untuk melampirkan skill yang kamu punya ke pesan. Chat teks tetap bisa tanpa wallet.",
      noSkillsOwned: "Kamu belum punya skill NFT untuk dilampirkan. Beli di Marketplace, atau tetap chat teks.",
      emptyFeedTitle: "Plaza masih sepi",
      emptyHistory: "Belum ada obrolan. Jadilah yang pertama menyapa!",
      viewInMarket: "lihat di Market",
      replyPlaceholder: "Tulis balasan...",
      replyAction: "Balas",
      replyNicknamePrompt: "Isi nickname di atas dulu untuk membalas.",
      cancelReply: "Batal",
      viewMoreRepliesPrefix: "Lihat ",
      viewMoreRepliesSuffix: " balasan lainnya",
      hideReplies: "Sembunyikan balasan",
      timeJustNow: "Baru saja",
      timeMinuteSuffix: "m",
      timeHourSuffix: "j",
      timeYesterday: "kemarin",
      timeDaySuffix: "h",
    },
    profile: {
      heading: "Koleksi Skill",
      totalItemsLabel: "Total item",
      loading: "Memuat koleksi...",
      error: "Gagal memuat koleksi",
      empty: "Belum punya skill/skin NFT",
      shareTitle: "Bagikan",
      copyLink: "Salin Link",
      linkCopied: "Link tersalin",
      shareX: "Share ke X",
      shareTelegram: "Share ke Telegram",
      shareText: "Cek koleksi skill TheBingoFi-ku",
      invalidAddress: "Address tidak valid",
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
      plaza: "Plaza",
      profile: "My Profile",
      profileConnectHint: "Connect a wallet first to see your profile",
      // langToggle/langFlag = the language CURRENTLY active (an indicator, not a
      // target). What clicking does is spelled out by langSwitch in aria-label/title.
      langToggle: "EN",
      langFlag: "🇬🇧",
      langSwitch: "Switch language to Indonesian",
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
      tagline: "Strategic bingo. Web2 gameplay, web3 ownership",
      heroTitle: "Draft Your Board, Claim the BINGO",
      heroSubtitle: "Turn-based bingo. Strategy, not luck.",
      nicknameLabel: "Nickname",
      nicknameRequiredHint: "Enter a nickname first to pick a game mode",
      nicknamePlaceholder: "Your nickname",
      joinCodeLabel: "Room Code",
      joinRoom: "Join",
      joinPrompt: "Got a room code?",
      playNow: "Play Now",
      modePickerLabel: "Pick a game mode",
      dailyLink: "Daily Challenge",
      questsLink: "Quests",
      marketLink: "Marketplace",
      quickMatch: {
        title: "Quick Match (VS Player)",
        desc: "Find an opponent instantly. Pick a player count, the draft auto-starts once the room fills up.",
        sizeLabel: "Player count",
      },
      roomBrowser: {
        title: "Open Rooms",
        desc: "Public rooms still waiting for players, join in one click.",
        refresh: "Refresh",
        loading: "Loading rooms...",
        error: "Failed to load room list",
        empty: "No open rooms yet. Create one or try Quick Match.",
        join: "Join",
        modeCasual: "Casual",
        modeStandard: "Standard",
      },
      createRoom: {
        title: "Create Room",
        desc: "Set your own target player count, mode, and visibility.",
        targetPlayersLabel: "Target players",
        modeLabel: "Room Mode",
        modeCasual: "Casual (no skills)",
        modeStandard: "Standard (uses skill NFTs)",
        modeStandardHint: "Needs a linked wallet to set a loadout. You can still play without one, no skills.",
        visibilityLabel: "Visibility",
        visibilityPublic: "Public (shown in Open Rooms)",
        visibilityPrivate: "Private (code only)",
        submit: "Create Room",
      },
      vsBot: {
        title: "VS Bot",
        desc: "Play solo against a bot, starts instantly, no lobby.",
        levelLabel: "Bot Level",
        levelHint: "Lv1 easygoing → Lv10 brutal",
        questHint: "Beat Lv1/3/5/7/10 for seasonal quest rewards",
      },
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
        loadoutNote: "Players without a loadout can still play, no skills, no disadvantage.",
        linkWallet: "Link Wallet to Room",
        linkWalletPending: "Linking wallet...",
        walletLinked: "Wallet linked",
        connectFirst: "Connect a wallet via the header button first, then link it to this room.",
        loadoutPickerTitle: "Pick Loadout (max 2)",
        loadoutSave: "Save Loadout",
        loadoutSaving: "Saving...",
        loadoutSaved: "Loadout saved",
        loadoutNoneOwned: "You don't own any skill NFTs yet. Buy some on the Marketplace, or play without skills.",
        loadoutCatalogLoading: "Loading skill catalog...",
        loadoutCatalogError: "Failed to load skill catalog",
        loadoutOwnedLabel: "owned",
        loadoutNotOwnedLabel: "not owned",
        loadoutPlayersTitle: "Everyone's Loadout",
        loadoutNone: "no skills",
        roomCodeCopy: "Copy Code",
        roomCodeCopied: "Code copied",
        playersSuffix: "players",
        visibilityPublic: "Public",
        visibilityPrivate: "Private",
        waitingForPlayers: "Waiting for players",
        autoStartNote: "match starts automatically once full",
        botBadge: "BOT",
      },
      draft: {
        title: "Arrange Board",
        instructions: "Click two cells or drag & drop to swap their positions.",
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
        yourTurn: "Your turn, pick a number",
        waitingTurn: "Waiting for other players",
        callNumber: "Call Number",
        callHint: "Your turn. Click an unmarked number on your board to call it.",
        bingoProgress: "BINGO progress",
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
        armedDoublePrefix: "Double Call armed, call ",
        armedDoubleSuffix: " numbers this turn",
        armedGhost: "Ghost Call armed, your next call only marks your own board",
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
      subtitle: "One puzzle a day, same for every player. Fewer calls to 5 lines means a higher score.",
      challengeNumber: "Challenge",
      nicknameLabel: "Nickname",
      play: "Play",
      result: {
        title: "Result",
        score: "Score",
        callsToBingo: "Calls to Bingo",
        shareCardTitle: "Share Card",
        // Result card meant to be screenshotted / shared.
        shareHint: "Screenshot this card, or share it with the buttons below.",
        shareX: "Share on X",
        shareTelegram: "Telegram",
        copyText: "Copy text",
        shareText: "I hit BINGO on call ",
        lines: "lines",
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
        reward: "XP",
        progress: "Progress",
      },
      // Group labels per quest window (the window data itself comes from the server).
      windowDaily: "Daily",
      windowWeekly: "Weekly",
      windowSeason: "Season",
      groupDone: "done",
      done: "Done",
      // "System window" style panel (see components/QuestList.tsx).
      panelTitle: "Quest Info",
      intro: "[Today's quests have arrived.]",
      goalLabel: "Goal",
      warning: "Daily quests reset at midnight UTC. Unfinished progress is lost.",
    },
    market: {
      title: "Marketplace",
      subtitle: "Buy Skill & Skin NFTs. Cosmetics & in-match actions, not pay-to-win.",
      heroTitle: "Collect skill, not luck",
      heroCta: "Browse collection",
      spotlightLabel: "Spotlight",
      spotlightNote: "The tightest supply in the catalog.",
      catalogTitle: "Skill Collection",
      viewDetails: "View details",
      detailsTitle: "Skill details",
      viewOnExplorer: "View contract on explorer",
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
      discountBadge: "Discount",
      premiumBadge: "Price rising (in demand)",
      stockRemaining: "Remaining",
      stockOf: "of",
      refundNote: "Sends a bit extra (2% buffer), any overpayment is auto-refunded by the contract.",
      tierCommon: "Common",
      tierUncommon: "Uncommon",
      tierRare: "Rare",
      tierSuperRare: "Super Rare",
    },
    plaza: {
      title: "Plaza",
      subtitle: "Global social hub. Talk strategy, find opponents, show off & promote your collection.",
      nicknamePrompt: "Set a nickname first to start chatting in the Plaza",
      nicknameLabel: "Nickname",
      nicknameSave: "Save",
      composerPlaceholder: "Chat, show off, or sell your collection... e.g. \"selling a rare Wild Daub, check my profile\"",
      send: "Send",
      attachSkillLabel: "Attach a skill",
      attachSkillNone: "No skill",
      connectForSkills: "Connect a wallet to attach a skill you own to a message. Text chat still works without one.",
      noSkillsOwned: "You don't own any skill NFTs to attach yet. Buy some on the Marketplace, or just chat.",
      emptyFeedTitle: "The Plaza is quiet",
      emptyHistory: "No messages yet. Be the first to say hi!",
      viewInMarket: "view in Market",
      replyPlaceholder: "Write a reply...",
      replyAction: "Reply",
      replyNicknamePrompt: "Set a nickname above first to reply.",
      cancelReply: "Cancel",
      viewMoreRepliesPrefix: "View ",
      viewMoreRepliesSuffix: " more replies",
      hideReplies: "Hide replies",
      timeJustNow: "Just now",
      timeMinuteSuffix: "m",
      timeHourSuffix: "h",
      timeYesterday: "yesterday",
      timeDaySuffix: "d",
    },
    profile: {
      heading: "Skill Collection",
      totalItemsLabel: "Total items",
      loading: "Loading collection...",
      error: "Failed to load collection",
      empty: "No skill/skin NFTs yet",
      shareTitle: "Share",
      copyLink: "Copy Link",
      linkCopied: "Link copied",
      shareX: "Share on X",
      shareTelegram: "Share on Telegram",
      shareText: "Check out my TheBingoFi skill collection",
      invalidAddress: "Invalid address",
    },
  },
} satisfies Record<Locale, LocaleStrings>;

export type Strings = typeof strings;

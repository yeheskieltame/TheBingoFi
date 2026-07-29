export type Locale = "id" | "en";

interface LocaleStrings {
  common: Record<string, string>;
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
}

export const strings = {
  id: {
    common: {
      loading: "Memuat...",
      copy: "Salin",
      copied: "Tersalin",
      back: "Kembali ke Beranda",
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
      ctaConnectWallet: "Connect Wallet",
      walletComingSoon: "(segera — menunggu deploy kontrak)",
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
      },
      quests: {
        title: "Quest Selesai",
        empty: "Belum ada quest selesai di sesi ini",
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
  },
  en: {
    common: {
      loading: "Loading...",
      copy: "Copy",
      copied: "Copied",
      back: "Back to home",
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
      ctaConnectWallet: "Connect Wallet",
      walletComingSoon: "(coming soon — waiting on contract deploy)",
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
      },
      quests: {
        title: "Quests Completed",
        empty: "No quests completed this session yet",
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
  },
} satisfies Record<Locale, LocaleStrings>;

export type Strings = typeof strings;

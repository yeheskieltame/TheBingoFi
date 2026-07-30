# TheBingoFi — Game Design & Architecture Concept v0.1

Bingo strategis free-to-play. Gameplay 100% web2 (tanpa transaksi selama match). Monetisasi lewat penjualan Skill & Skin NFT oleh platform — model "catur modern GameFi": beli kemampuan khusus, bukan taruhan.

Target chain: GIWA (OP Stack L2). Target program: GASOK — track Consumer/Social (alternatif: GIWA-Native Ideas).

---

## 1. Prinsip Desain

1. **Bukan judi.** Tidak ada stake, tidak ada pot, tidak ada pool taruhan. Revenue murni dari penjualan skill/skin. Ini pembeda total dari Bingochain.
2. **Web2-feel.** User login, main, selesai — tanpa satu pun tx on-chain saat bermain. Wallet hanya dipakai saat beli/klaim NFT.
3. **Skill over luck.** Bingo klasik itu luck murni; skill NFT + keputusan pemain yang membuatnya jadi game strategi.
4. **Fair, bukan pay-to-win.** Skill dibatasi slot + charge, dan matchmaking memisahkan tier.

## 2. Core Gameplay (baseline, tanpa skill)

- Board 5×5, multiplayer 2–8 pemain per room.
- Sebelum match, pemain **menyusun sendiri** penempatan angka (1–25) di board-nya (draft phase). Board lawan tersembunyi.
- **Pemain memanggil angka secara bergantian** (turn-based) — bukan server random. Angka yang dipanggil ter-mark di SEMUA board.
- Strategi inti: susunan board + memilih angka yang paling menguntungkan board sendiri sambil menebak/menghindari kebutuhan lawan.
- **Menang: pemain pertama yang menyelesaikan 5 garis** (horizontal/vertikal/diagonal), tiap garis = 5 angka ter-mark → B-I-N-G-O.
- Reward menang: XP, season points, leaderboard, item kosmetik non-tradeable. **Bukan uang.**

## 3. Skill System

- Skill = **kartu aksi aktif** yang dipakai saat match, seperti bidak catur dengan gerakan spesial.
- **Loadout:** maksimal 2 skill per match.
- **Charge:** tiap skill punya jumlah pakai per match (umumnya 1x) + cooldown antar giliran.
- **Counterplay:** setiap skill punya jawaban (lihat Disrupt/Shield), jadi meta-nya rock-paper-scissors, bukan stat war.
- **Matchmaking:** room dibagi Casual (tanpa skill), Standard (loadout aktif), Ranked (loadout + tier matching).

### 5 Skill Awal

| # | Skill | Efek | Charge | Counter |
|---|-------|------|--------|---------|
| 1 | **Wild Daub** | Tandai 1 sel di board sendiri tanpa angkanya dipanggil | 1x/match | Nullify |
| 2 | **Double Call** | Panggil 2 angka dalam 1 giliran | 1x/match | Nullify |
| 3 | **Ghost Call** | Angka yang kamu panggil giliran ini hanya ter-mark di board-mu, tidak di board lawan | 1x/match | Nullify |
| 4 | **Cell Swap** | Tukar posisi 2 sel di board sendiri di tengah match | 1x/match | — |
| 5 | **Nullify** | Batalkan 1 skill yang baru dipakai lawan | 1x/match | timing |

Skin (lini kedua, kosmetik murni): tema board, efek daub, avatar frame, victory animation. Tanpa efek gameplay.

### Rarity & Varian

Satu skill punya varian rarity yang mengubah *flavor*, bukan kekuatan mentah — mis. Wild Daub rare punya animasi khusus + 1 reroll kosmetik. Kekuatan efek dijaga flat agar tidak pay-to-win; rarity menjual prestise & visual.

**Identitas premium per skill** (referensi rasa: Pixie Chess): tiap skill = karakter/mascot dengan visual asset khusus — ikon, ilustrasi kartu, animasi cast di board (daub meledak, ghost berbayang, swap berputar), dan frame/efek berbeda per tier rarity. Makin rare makin "hidup" assetnya (static → animated → full effect). Struktur metadata NFT menyediakan slot `image` + `animation_url` + atribut rarity sejak awal supaya asset tinggal di-drop tim visual tanpa ubah kontrak.

## 4. Ekonomi

- **Primary sale:** platform mint & jual skill/skin (limited drop per season) dengan **harga dinamis on-chain**:
  - **Scarcity ramp:** harga naik seiring stok terjual (mendekati sold-out = makin mahal). Item ber-supply super kecil (mis. 1 unit = super rare) dihargai base price premium sejak rilis.
  - **Demand decay:** kalau lama tidak ada pembelian, diskon bertahap muncul (sampai batas maksimal); sekali ada yang beli, diskon reset. Rame = mahal, sepi = diskon — pasar yang mengatur.
  - Parameter (persen ramp, interval decay, diskon maks) di-set platform per marketplace, bisa dituning tanpa redeploy.
- **Secondary:** tradeable di marketplace, platform ambil royalti (mis. 5%).
- **Season model:** tiap season rilis batch skill baru lewat factory — konten segar tanpa ubah kontrak.
- **Free player tetap kompetitif:** mode Casual tanpa skill + skill starter pinjaman (non-NFT, tidak tradeable) agar onboarding tanpa wallet sama sekali.

## 5. Arsitektur On-chain (modular)

Prinsip: **on-chain = ownership & katalog; off-chain = gameplay.** Game server membaca chain lewat indexer; tidak pernah menulis saat match.

```
┌─────────────────────────── GIWA L2 ───────────────────────────┐
│                                                               │
│  SkillFactory ──creates──► SkillCollection (ERC-1155)         │
│       │                        │                              │
│       └──registers──► SkillRegistry (katalog efek on-chain)   │
│                                                               │
│  Marketplace (primary sale + royalty)                         │
└───────────────────────────────────────────────────────────────┘
              ▲ read-only (indexer)
              │
   Game Backend (authoritative server)
   - verifikasi ownership skill saat matchmaking
   - eksekusi efek skill (logic off-chain)
   - validasi giliran & panggilan angka pemain (turn-based)
              │
   Client (web, web2 UX, wallet connect opsional)
```

### Kontrak

**SkillRegistry** — sumber kebenaran katalog skill.

```solidity
struct SkillDef {
    uint256 skillId;
    bytes32 effectType;   // "WILD_DAUB", "ORACLE_EYE", ...
    uint8   charges;      // pakai per match
    uint8   cooldown;     // giliran
    uint8   maxPerLoadout;
    uint16  rarity;
    bool    active;       // bisa di-disable tanpa hapus
    string  metadataURI;
}
```

**SkillFactory** — hanya platform (owner/role) yang bisa mint tipe baru.

```solidity
function createSkill(SkillDef calldata def, uint256 maxSupply, uint256 price)
    external onlyRole(CREATOR_ROLE) returns (uint256 skillId);
```

- `createSkill` = "constructor isi skill" yang kamu maksud: satu call mendefinisikan efek, supply, harga → langsung terdaftar di Registry & siap dijual.
- Efek game **tidak dieksekusi on-chain** — `effectType` hanya identifier; interpretasinya di game server. Ini yang membuatnya benar-benar modular: game apa pun (bahkan game kedua nanti) tinggal baca Registry dan mapping effectType → logic sendiri.

**SkillCollection (ERC-1155)** — satu kontrak untuk semua skill & skin; `tokenId = skillId`. Lebih murah gas dan lebih simpel diindeks daripada satu ERC-721 per skill.

**Marketplace** — primary sale (mint on purchase) + EIP-2981 royalty untuk secondary.

### Kenapa modular

- Tambah skill baru = 1 tx `createSkill`, tanpa deploy/upgrade kontrak.
- Nerf/disable skill bermasalah = set `active=false` (game server hormati flag).
- Balance patch = versi baru skill; versi lama bisa di-sunset dari ranked tapi tetap dimiliki (nilai koleksi).
- Registry terpisah dari token → skin, skill, bahkan item game lain pakai pipeline yang sama.

## 6. GIWA / GASOK Fit

- **Track:** Consumer/Social (game + creator economy) atau GIWA-Native.
- **GIWA ID:** username on-chain pemain di leaderboard.
- **Dojang (KYC attestation):** ranked/tournament khusus verified user → anti-smurf & anti-bot, narasi kuat untuk "fair competitive gaming".
- **Narasi GASOK:** "web2 gameplay, web3 ownership" = persis tesis mass adoption; plus pivot dari gambling → skill game menunjukkan kematangan desain.
- **1s block time GIWA:** klaim & pembelian NFT terasa instan, mendukung UX web2.

## 7. Social & Live-Ops Layer (inti track Consumer/Social)

GASOK tidak punya track GameFi — yang dinilai adalah kemampuan membawa massive user & interaksi sosial. Maka social loop = fitur kelas satu, bukan tempelan.

### 7.1 Daily Challenge (hook viral, ala Wordle)

- Tiap hari 1 puzzle solo yang SAMA untuk semua pemain global: urutan panggilan angka deterministik (seed = tanggal), pemain menyusun board lalu hasilnya diskor (jumlah garis + kecepatan komplit).
- Leaderboard harian global + friends. Hasil bisa di-share sebagai kartu/grid emoji ("BingoFi #127 — 5 garis, call ke-18") → loop viral gratis.
- Streak harian (3/7/30 hari) dengan reward kosmetik. Ini mesin retensi harian utama.

### 7.2 Quest System

- **Daily quest** (reset harian): main 3 match, menang 1x, pakai skill tertentu, selesaikan garis diagonal, main bareng teman.
- **Weekly quest**: menang 10 match, win-streak 3, undang 1 teman, ikut 1 event.
- **Monthly/Seasonal quest chain**: rantai quest naratif per season, puncaknya kosmetik eksklusif season.
- Reward: XP, season points, kosmetik non-tradeable, tiket event. Tidak pernah uang/token.
- **Season Pass gratis** (progression track kosmetik) — premium track opsional berisi kosmetik saja.

### 7.3 Event & Challenge Berkala

- **Weekend Event**: mode spesial (pola menang khusus — huruf, bentuk; modifier lucu mis. semua orang dapat 1 Wild Daub gratis).
- **Monthly Tournament**: bracket terbuka, final khusus Dojang-verified (anti-bot/smurf) — narasi GIWA-native yang kuat.
- **Community Goal**: milestone global ("komunitas menyelesaikan 100k garis minggu ini → semua pemain dapat skin gratis") — kolaboratif, bukan kompetitif.

### 7.4 Social Graph & Interaksi

- Friends + invite link; **referral quest** (pengundang & yang diundang dua-duanya dapat reward).
- **Private room via kode** (main bareng teman tanpa matchmaking) + rematch 1 klik.
- **Spectator mode** untuk room teman/tournament.
- **Emote & quick-chat** in-match (preset, aman dari toxic; emote premium = lini kosmetik).
- **Club/Guild**: club quest mingguan (akumulasi anggota), club leaderboard, club chat.

### 7.4b Plaza — Ruang Sosial & Showcase (ala sosmed)

- **Ruang diskusi global (Plaza):** chat publik realtime — ngobrol strategi, cari lawan, **promosi asset** ("jual Wild Daub rare, cek profilku").
- **Pamer skill:** pesan chat bisa melampirkan kartu skill yang dimiliki (render sebagai kartu, bukan teks) — flex koleksi langsung di percakapan.
- **Profil publik shareable:** `/profile/<address>` — koleksi skill on-chain, stats, streak. Tombol share ke sosmed lain (X/Telegram/copy link) dengan preview card (OG image) — tiap share = akuisisi gratis (K-factor).
- Moderasi: rate limit + panjang pesan dulu; report/mute menyusul. Marketplace P2P (escrow listing antar user) menyusul setelah Plaza hidup — v1 promosi berbasis chat + royalti EIP-2981 sudah jalan di transfer mana pun.

### 7.5 Leaderboard & Identity

- Leaderboard: global, weekly (reset tiap Senin), friends-only, club, daily challenge.
- Identity: GIWA ID sebagai username on-chain; profil publik (stats, koleksi skill/skin, streak).

### 7.6 Metrik (untuk KPI GASOK)

DAU & D1/D7/D30 retention (daily challenge + quest), K-factor (referral + share card), match per user per hari, konversi guest → wallet-linked. Fitur di atas masing-masing menyasar minimal satu metrik ini.

## 8. Open Questions (next iteration)

1. Draft phase: angka bebas disusun 1–25 atau pool lebih besar (mis. 1–50) agar tidak semua board berisi angka sama?
2. Skill pricing: fixed price vs dutch auction per drop?
3. Starter skill non-NFT: berapa lama sebelum user "graduate" ke NFT?
4. Anti-cheat: replay hash match di-anchor ke chain per batch (opsional, murah di GIWA)?
5. Daily challenge: skor pakai jumlah call minimum atau timer, atau kombinasi?
6. Club: berapa max anggota, dan apakah club butuh representasi on-chain (nanti) atau full off-chain dulu?

## 9. Roadmap Singkat

1. **W1:** Finalisasi konsep + apply GASOK (deadline 31 Jul).
2. **W2–4:** Prototype gameplay web2 (tanpa chain) + balancing 5 skill + **daily challenge**.
3. **W5–6:** Kontrak Registry/Factory/Collection di GIWA Sepolia + indexer + **quest engine & leaderboard**.
4. **W7–8:** Marketplace + integrasi ownership + **friends/private room/share card** → MVP demo.

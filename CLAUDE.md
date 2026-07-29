# TheBingoFi

Game bingo strategis multiplayer, free-to-play, NON-gambling. Gameplay 100% web2 (nol transaksi on-chain selama match). Monetisasi: platform menjual Skill & Skin NFT — model "catur modern GameFi". Pivot dari proyek lama Bingochain (Celo, betting) — jangan bawa mekanik taruhan/pot/stake apa pun ke proyek ini.

Baca `CONCEPT.md` untuk game design lengkap sebelum mengubah desain apa pun. File itu adalah source of truth konsep.

## Aturan Main (core, wajib dipahami)

- Board 5×5. Saat draft phase, pemain menyusun sendiri penempatan angka di board-nya. Board lawan tersembunyi.
- Pemain memanggil angka SECARA BERGANTIAN (turn-based). Bukan server random. Angka yang dipanggil ter-mark di semua board.
- Menang: pemain PERTAMA yang menyelesaikan 5 garis (horizontal/vertikal/diagonal). 1 garis = 5 angka ter-mark. 5 garis = B-I-N-G-O.
- Multiplayer 2–8 pemain per room.
- Reward menang: XP, season points, leaderboard, kosmetik non-tradeable. Tidak pernah uang/token.

## Skill System

- Skill = kartu aksi aktif dipakai in-match. Max 2 skill per loadout, charge terbatas (umumnya 1x/match).
- 5 skill awal: Wild Daub (mark 1 sel sendiri tanpa dipanggil), Double Call (2 angka dalam 1 giliran), Ghost Call (angka hanya ter-mark di board sendiri), Cell Swap (tukar 2 sel sendiri), Nullify (batalkan skill lawan).
- Efek skill dieksekusi di GAME SERVER, bukan on-chain. On-chain hanya ownership + katalog.
- Mode: Casual (tanpa skill), Standard, Ranked.

## Social & Live-Ops (WAJIB — inti track Consumer/Social GASOK)

GASOK tidak punya track GameFi; yang dinilai adalah social loop & massive user. Fitur ini kelas satu, bukan tempelan. Detail lengkap di CONCEPT.md §7.

- **Daily Challenge** (ala Wordle): puzzle solo harian, urutan panggilan deterministik dari seed tanggal (semua pemain global dapat puzzle sama), skor = garis + kecepatan. Leaderboard harian + share card (grid emoji/gambar). Streak 3/7/30 hari.
- **Quest System**: daily/weekly/seasonal quest, data-driven — quest didefinisikan sebagai data (id, type, target, window, reward), BUKAN hardcode; engine mengevaluasi event match (match_played, match_won, skill_used, line_completed, friend_invited) terhadap quest aktif.
- **Event berkala**: weekend event (pola menang khusus/modifier), monthly tournament (final Dojang-verified), community goal (milestone global → reward semua pemain).
- **Social graph**: friends, invite/referral link (dua arah reward), private room via kode, rematch, spectator mode, emote/quick-chat preset in-match, club/guild (club quest + club leaderboard).
- **Leaderboard**: global, weekly reset, friends, club, daily challenge. Identity pakai GIWA ID.
- **Season Pass gratis** (kosmetik); premium track kosmetik-only. Reward SELALU XP/kosmetik/tiket — tidak pernah uang/token.
- Metrik target (KPI GASOK): DAU, D1/D7/D30 retention, K-factor referral, konversi guest → wallet.

Catatan implementasi: emisi event gameplay dari engine (event bus) → quest evaluator & leaderboard terpisah dari logika match; daily challenge pakai engine yang sama dengan mode solo + call sequence dari seeded PRNG (seed = YYYY-MM-DD + salt server).

## Arsitektur

Prinsip: on-chain = ownership & katalog; off-chain = seluruh gameplay. Server authoritative, client tidak dipercaya.

- `contracts/` — Solidity, pakai Foundry.
  - `SkillRegistry` — katalog SkillDef: skillId, effectType (bytes32 identifier, mis. "WILD_DAUB"), charges, cooldown, maxPerLoadout, rarity, active flag, metadataURI.
  - `SkillFactory` — `createSkill(SkillDef, maxSupply, price)`, hanya CREATOR_ROLE (platform). Menambah skill = 1 tx, tanpa deploy baru.
  - `SkillCollection` — satu ERC-1155 untuk semua skill & skin, tokenId = skillId.
  - `Marketplace` — primary sale (mint on purchase) + royalti EIP-2981 (5%).
  - effectType TIDAK dieksekusi on-chain — hanya identifier yang di-mapping ke logic di game server.
- `server/` — game backend (Node.js + TypeScript). Authoritative: validasi giliran, panggilan angka, eksekusi skill, deteksi menang. Realtime via WebSocket (Socket.IO atau Colyseus). Verifikasi ownership skill saat matchmaking via read-only RPC/indexer.
- `web/` — Next.js + TypeScript + Tailwind. Wallet connect (wagmi + viem) HANYA untuk beli/klaim NFT dan link akun; guest play tanpa wallet harus bisa.

## GIWA Chain (target deploy)

GIWA = Ethereum L2 berbasis OP Stack milik Dunamu/Upbit (partner Optimism Foundation). EVM-compatible penuh, block time 1 detik. Tooling Ethereum standar (Foundry, viem) langsung jalan.

### GIWA Sepolia (testnet — target saat ini)

- Chain ID: `91342`
- RPC: `https://sepolia-rpc.giwa.io/` (rate-limited, jangan untuk production)
- Flashblocks RPC: `https://sepolia-rpc-flashblocks.giwa.io/`
- Currency: ETH
- Explorer: `https://sepolia-explorer.giwa.io`
- Gas token: ETH Sepolia (bridge dari Ethereum Sepolia; faucet Sepolia biasa lalu bridge)
- Mainnet: BELUM ada (masih development). Semua deploy ke Sepolia dulu.
- Docs: https://docs.giwa.io/
- Ekosistem GIWA yang bisa diintegrasikan nanti: GIWA ID (username on-chain, ENS subdomain), Dojang (KYC attestation — untuk ranked verified), Giwa Wallet.

Konteks bisnis: proyek ini diarahkan ke GASOK (akselerator GIWA, https://giwa.io/gasok), track Consumer/Social. Positioning: "web2 gameplay, web3 ownership".

## Konvensi

- TypeScript strict di server & web. Solidity ^0.8.24, OpenZeppelin untuk ERC-1155/AccessControl/EIP-2981.
- Test wajib: Foundry test untuk semua kontrak; unit test game logic (win detection, turn order, tiap skill + interaksi Nullify).
- Game logic (aturan bingo, skill resolution) ditulis sebagai pure functions terpisah dari transport/WebSocket agar mudah ditest.
- Jangan simpan private key di repo. Pakai `.env` (sudah harus ada di `.gitignore`), deploy via `forge script` dengan env var.
- Bahasa UI: Indonesia + English (i18n sejak awal kalau murah, minimal struktur string terpisah).

## Urutan Kerja Disarankan

1. Monorepo scaffold (pnpm workspaces: `contracts/`, `server/`, `web/`).
2. Game engine pure TS: board, draft phase, turn-based calling, win detection 5 garis — full unit test.
3. Server realtime + room/matchmaking + guest play.
4. Web client MVP (draft board, main, lihat panggilan, deteksi menang).
5. Skill system di engine (5 skill + counterplay Nullify).
6. Kontrak Registry/Factory/Collection/Marketplace + test + deploy GIWA Sepolia.
7. Integrasi ownership: wallet link → loadout dari NFT yang dimiliki.
8. Daily Challenge (seeded solo mode) + leaderboard harian + share card.
9. Quest engine data-driven (daily/weekly) + XP/season points.
10. Friends + invite/referral + private room via kode + emote in-match.
11. Event scheduler (weekend event, community goal) + club/guild.

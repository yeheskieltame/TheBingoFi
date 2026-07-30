# TheBingoFi — Brief Tim UI

> **TL;DR: seluruh aplikasi sudah 100% fungsional dan teruji. Tugas kalian satu: bikin tampilannya sekelas game, tanpa mengubah logic.** Dokumen ini menjelaskan produknya, cara menjalankan, lalu daftar kerja per layar dengan prioritas.

---

## 1. Produknya Apa

**TheBingoFi = bingo strategis multiplayer, free-to-play, BUKAN judi.** Pemain menyusun sendiri board 5×5-nya (angka 1–25), lalu **memanggil angka bergantian** — menang = pemain pertama yang melengkapi **5 garis** (tiap garis lengkap menyalakan huruf: 1 garis = **B**, 2 = **B-I**, … 5 = **B-I-N-G-O**). Ditambah **Skill NFT** (kartu aksi spesial ala bidak catur). Gameplay 100% web2 — wallet hanya untuk beli/koleksi NFT. Tidak ada taruhan/stake dalam bentuk apa pun.

Konteks bisnis singkat: dikejar buat akselerator **GASOK** (GIWA L2) track **Consumer/Social** — yang dinilai adalah daya tarik massal + social loop. KPI: DAU, retention (daily challenge + quest), K-factor (share card + profil), konversi guest→wallet. Artinya: **daily challenge share card, profil, dan market adalah layar "marketing"** — bukan pelengkap.

## 2. Cara Mulai Kerja (5 menit)

```bash
git clone <repo> && cd TheBingoFi
pnpm install
pnpm --filter @thebingofi/server dev   # terminal 1 — API + realtime :3001
pnpm --filter @thebingofi/web dev      # terminal 2 — web :3000
```

Lihat semua yang perlu didesain dalam 10 menit:
1. Buka `localhost:3000` → isi nickname → **VS Bot Lv3** → mainkan sampai menang (lihat draft, board, huruf BINGO, hasil).
2. Buka 2 tab → **Quick Match 2 pemain** di keduanya (auto-start, multiplayer real).
3. Buka `/daily` (main + share card), `/quests`, `/market`, `/plaza`, `/profile/0xDA50Dbbb2F23ED79F20d433396f6dbcB7EF2A674`.

## 3. Aturan Kerja (WAJIB — biar tidak bentrok dengan tim logic)

| | |
|---|---|
| ✅ **Bebas diubah** | `web/src/components/`, `web/src/app/` (halaman), `globals.css`, tambah lib UI/animasi/font |
| ❌ **Jangan disentuh** | `web/src/lib/`, `web/src/hooks/` (logic teruji — kalian tidak perlu paham socket/wagmi), `server/`, `contracts/` |
| 📝 **Teks** | SEMUA lewat `web/src/i18n/strings.ts` (id + en). Jangan hardcode string di komponen |
| 🧩 **Kontrak komponen** | Komponen menerima props — ganti tampilannya sebebas apa pun, **jangan ubah nama/bentuk props**. Daftar komponen + props: [web/README.md](web/README.md) |
| ✅ **Definition of done** | `pnpm --filter @thebingofi/web build` hijau + semua flow di §2 tetap jalan + kebaca di layar HP |

## 4. Daftar Kerja per Layar (dengan prioritas)

### P1 — `/play`: layar match (jantung produk)

Yang sudah ada (fungsional, tampilan polos): 4 fase dalam satu halaman.
- **Lobby** — daftar pemain "X/Y" (2–5), badge Publik/Privat/BOT, kode room copyable; quick match auto-start tanpa host; room Standard: tombol link wallet + loadout picker NFT.
- **Draft** — susun board: klik 2 sel ATAU drag & drop untuk tukar, tombol acak, validasi realtime.
- **Match** — **board sendiri = tempat memanggil angka** (klik sel yang belum ter-mark saat giliranmu; tidak ada grid picker terpisah). Huruf **B-I-N-G-O** besar di atas board + mini per pemain di tabel. Indikator giliran, deretan angka terpanggil, **panel skill** (charge, mode pilih sel Wild Daub/Cell Swap), **banner Nullify dengan countdown 15 detik**, notifikasi quest completed + riwayat skill.
- **Result** — pemenang, tombol "Main Lagi" (mengulang mode yang sama).

Desain yang dibutuhkan:
- [ ] Sel board: bedakan dengan jelas 4 status — belum ter-mark, **bisa diklik (giliranku)**, ter-mark, target skill — plus animasi daub saat sel ter-mark (ini momen paling sering terjadi di game).
- [ ] Momen huruf BINGO nyala (garis lengkap) = momen dopamin — kasih perayaan visual.
- [ ] "Giliranku vs nunggu" harus kebaca <1 detik, termasuk "giliran Bot Lv7".
- [ ] Banner Nullify = momen tegang (countdown 15s) — desain seperti "interrupt" fighting game.
- [ ] Layar menang/kalah yang layak di-screenshot.

### P1 — `/` home: pintu masuk 4 mode

Yang sudah ada: input nickname → 4 kartu mode: **Quick Match** (pilih 2–5 pemain), **Room Terbuka** (browser publik, refresh 10s), **Buat Room** (target pemain, casual/standard, publik/privat), **VS Bot** (grid level 1–10) + form gabung via kode.
- [ ] Hierarki: pemain baru harus langsung paham "klik ini buat main sekarang" (Quick Match / VS Bot menonjol).
- [ ] Grid level bot 1–10: kasih rasa "ladder" (Lv1 santai → Lv10 brutal; hint quest Lv1/3/5/7/10 berhadiah).

### P1 — `/daily`: mesin viral

Yang sudah ada: susun board → submit → skor + **share card teks** (tombol salin) → leaderboard harian.
- [ ] **Share card = deliverable terpenting kalian di halaman ini** — desain versi visual (grid emoji/warna, nomor challenge, skor) yang bikin orang bangga posting ke X/IG story.
- [ ] Leaderboard yang enak dilihat (top 3 menonjol).

### P2 — `/market`: etalase premium

Yang sudah ada: katalog on-chain, **harga dinamis** (badge "Diskon x%" / "Harga naik (laris)"), progress stok "tersisa X dari Y", **tier badge** Super Rare (supply ≤10) → Rare → Uncommon → Common, beli via wallet + link tx, slot `image`/`animation_url` per skill (fallback inisial).
- [ ] **Kartu skill = kanvas premium** (referensi rasa: **Pixie Chess**) — tiap skill diperlakukan sebagai karakter/mascot: ilustrasi, frame per tier, makin rare makin "hidup" (static → animated). Asset final kalian yang buat; sistem tinggal terima file (drop ke slot metadata — tanpa ubah kode/kontrak).
- [ ] Super Rare (Nullify, 10 unit @0.01 ETH) harus terasa mahal & langka.

### P2 — `/plaza` + `/profile/[address]`: layar sosial

Yang sudah ada: chat global realtime (pesan bisa **melampirkan kartu skill** yang dimiliki — pamer/promosi; klik kartu → market), profil publik koleksi on-chain + tombol share copy/X/Telegram.
- [ ] Kartu skill di chat harus menonjol dari teks (ini fitur flex).
- [ ] Profil = halaman yang di-share keluar — layout showcase yang pantas jadi "kartu nama" pemain.

### P3 — `/quests`, header/nav, states

- [ ] Quest list + progress bar (termasuk 5 quest bot ladder window "season").
- [ ] Nav konsisten, wallet connect state, language switcher id/en.
- [ ] Loading/empty/error state seragam (sekarang ada tapi seadanya).

## 5. Arah Rasa (panduan, bukan aturan)

- **Web2 game-feel** — onboarding nickname → main <30 detik; jangan berasa "aplikasi crypto". Wallet muncul hanya di market/profil/standard room.
- **Mobile dulu** — board 5×5 dan semua aksi harus nyaman satu jempol.
- **Juicy tapi jelas** — animasi boleh rame di momen (daub, huruf BINGO, menang), tapi status permainan harus selalu terbaca sekejap.
- Bilingual id/en sudah tersedia — desain jangan bergantung panjang teks satu bahasa.

## 6. Yang JANGAN Didesain Dulu (belum ada di server)

Friends/referral, club/guild, spectator, emote in-match, event weekend/tournament, season pass, marketplace P2P antar-user. Nanti ada brief susulan.

## 7. Referensi

| Butuh apa | Lihat |
|---|---|
| Cara jalanin + **daftar komponen & props** | [web/README.md](web/README.md) |
| Konsep & game design lengkap (rules, skill, ekonomi, social) | [CONCEPT.md](CONCEPT.md) |
| Arsitektur + kontrak live GIWA Sepolia | [README.md](README.md) |
| API server (kalau penasaran — tidak wajib) | [server/API.md](server/API.md) |
| Status teknis: 217 test server, 52 test kontrak (coverage 100%), build hijau | — |

# TheBingoFi — Brief untuk Tim FE/UI

> Dokumen orientasi: apa produk ini, mau ke mana, apa yang sudah jalan, dan persisnya apa yang perlu kalian buat. Detail teknis lanjutan ada di link tiap bagian.

## 1. Produk dalam Satu Paragraf

**TheBingoFi = bingo strategis multiplayer, free-to-play, BUKAN judi.** Bingo klasik itu untung-untungan; di sini pemain **menyusun sendiri board-nya** dan **memanggil angka bergantian** (turn-based), jadi menang ditentukan strategi — ditambah **Skill NFT** (kartu aksi spesial, kayak bidak catur dengan gerakan khusus). Gameplay 100% web2: login → main → selesai, **nol transaksi on-chain saat match**. Wallet hanya dipakai saat beli/klaim NFT. Monetisasi murni dari platform menjual Skill & Skin NFT — "catur modern GameFi", bukan taruhan. **Tidak ada stake/pot/pool taruhan dalam bentuk apa pun.**

## 2. Goals & Konteks Bisnis

- Target: program akselerator **GASOK** dari GIWA (L2 Ethereum milik Dunamu/Upbit), track **Consumer/Social**. Positioning: *"web2 gameplay, web3 ownership"*.
- GASOK **tidak punya track GameFi** — yang dinilai adalah kemampuan menarik massive user & interaksi sosial. Karena itu **social loop = fitur kelas satu**, bukan tempelan.
- KPI yang dikejar (tiap fitur harus menyasar minimal satu): **DAU**, **D1/D7/D30 retention** (daily challenge + quest), **K-factor** (referral + share card), **match per user per hari**, **konversi guest → wallet-linked**.
- Free player harus tetap kompetitif: guest play tanpa wallet, mode Casual tanpa skill, skill starter pinjaman. **Reward selalu XP/kosmetik/tiket — tidak pernah uang/token.**

## 3. Cara Main (yang harus dipahami sebelum desain)

1. **Lobby**: buat room / gabung via kode 6 karakter. 2–8 pemain. Guest cukup nickname.
2. **Draft**: tiap pemain menyusun angka 1–25 di board 5×5 miliknya. **Board lawan rahasia** — sampai match selesai tidak pernah terlihat.
3. **Match**: pemain **memanggil angka bergantian**. Angka terpanggil ter-mark di SEMUA board. Strategi: pilih angka yang menguntungkan board sendiri sambil menebak kebutuhan lawan.
4. **Menang**: pemain pertama yang menyelesaikan **5 garis** (baris/kolom/diagonal; 1 garis = 5 sel ter-mark) → B-I-N-G-O.
5. **Skill** (mode Standard/Ranked; belum ada di UI sekarang): loadout max 2 skill, umumnya 1x pakai per match. 5 skill awal: Wild Daub, Double Call, Ghost Call, Cell Swap, Nullify (counter-nya). Meta rock-paper-scissors, bukan pay-to-win.

Aturan lengkap + skill system + ekonomi: [CONCEPT.md](CONCEPT.md).

## 4. Social Layer (pembeda utama — prioritas produk)

- **Daily Challenge** (ala Wordle): 1 puzzle solo per hari, SAMA untuk semua pemain global (urutan panggilan deterministik dari tanggal). Susun board → diskor (kecepatan mencapai 5 garis) → **share card grid emoji** buat dibagikan → leaderboard harian → streak 3/7/30 hari. Ini mesin retensi + viral utama.
- **Quest**: daily/weekly/seasonal ("main 3 match", "menang 1x", "selesaikan garis diagonal"...) → XP, season points, kosmetik.
- **Nanti** (belum ada di server): friends + referral, spectator, emote in-match, club/guild, event weekend, tournament, season pass. Detail: [CONCEPT.md](CONCEPT.md) §7.

## 5. Status Sekarang (yang sudah jalan beneran)

| Layer | Status |
|---|---|
| Game engine (board, draft, turn, menang) | ✅ pure TS, 100% tested |
| Server realtime (Socket.IO: room/kode, draft, match, anti-cheat redaksi board) | ✅ jalan, tested |
| HTTP API (daily challenge, leaderboard harian, quests) | ✅ jalan + CORS, tested |
| Smart contract (Registry, Factory, Collection ERC-1155, Marketplace) | ✅ **live & verified di GIWA Sepolia**, katalog 5 skill terisi, coverage 100% |
| Kerangka FE (semua flow di atas, consume penuh) | ✅ fungsional, **tanpa styling — porsi kalian** |
| Skill in-match, wallet connect, marketplace UI, friends/club | ⏳ belum — jangan didesain dulu kecuali diminta |

## 6. Tugas Tim FE/UI — Persisnya

**Yang dikerjakan: poles seluruh tampilan & UX dari kerangka yang sudah fungsional.** Semua logic (socket, state, fetch, validasi) SUDAH jadi dan teruji — kalian tidak perlu paham Socket.IO sama sekali.

Halaman yang menunggu didesain (semua sudah jalan, markup HTML polos):

1. **`/` Landing** — nickname, buat room, gabung via kode, link ke daily & quests.
2. **`/play`** — 4 fase dalam satu halaman: **Lobby** (daftar pemain, kode room yang enak dibagikan, tombol host), **Draft** (susun board 5×5: acak + tukar sel, validasi realtime), **Match** (board sendiri dengan sel ter-mark, angka terpanggil, indikator giliran — INI layar paling penting, kejelasan "sekarang giliran siapa & angka mana yang menguntungkan" adalah inti game feel), **Result** (pemenang + alasan).
3. **`/daily`** — susun board, hasil skor, **share card** (aset viral utama — bikin semenarik mungkin buat di-screenshot/dibagikan), leaderboard harian.
4. **`/quests`** — daftar quest + progress.
5. Notifikasi **quest completed** yang muncul saat main.

**Aturan repo (penting, dijaga biar tidak bentrok):**

- ✅ Boleh diubah bebas: `web/src/components/`, `web/src/app/` (halaman), `globals.css`, tambah lib UI/animasi kalau perlu.
- ❌ Jangan sentuh: `web/src/lib/` & `web/src/hooks/` (logic teruji), `server/`, `contracts/`.
- Semua teks lewat `web/src/i18n/strings.ts` (id/en) — jangan hardcode string di komponen.
- Komponen sudah dipecah per fungsi dan terima props — daftar lengkap + props + cara jalanin lokal: [web/README.md](web/README.md).

**Di luar scope sekarang** (tombolnya ada tapi disabled, biarkan): wallet connect, beli NFT/marketplace, halaman koleksi. Menyusul setelah UI inti rapi.

## 7. Arah Rasa (bukan aturan — kalian yang pegang visual)

- **Web2-feel**: onboarding harus se-frictionless game casual — nickname → main dalam <30 detik. Jangan ada kesan "aplikasi crypto".
- Bilingual **ID/EN** sejak awal (struktur string sudah ada, default id).
- Board & giliran = jantung UX: sel ter-mark, garis yang hampir jadi, dan "giliranku/bukan" harus terbaca dalam sekejap — termasuk di layar HP.
- Share card daily challenge = alat marketing gratis; desain grid emoji/visualnya supaya orang bangga posting.

## 8. Referensi Cepat

| Butuh apa | Lihat |
|---|---|
| Konsep & game design lengkap | [CONCEPT.md](CONCEPT.md) |
| Arsitektur full-stack + kontrak live | [README.md](README.md) |
| Cara jalanin + daftar komponen & props | [web/README.md](web/README.md) |
| Kontrak API server (event + endpoint) | [server/API.md](server/API.md) |
| Detail smart contract + diagram alur | [contracts/README.md](contracts/README.md) |

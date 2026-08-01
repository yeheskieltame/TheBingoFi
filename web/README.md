# TheBingoFi — web

Frontend Next.js (App Router, TS strict) untuk TheBingoFi. Semua flow inti
(room realtime, daily challenge, quests) **dan** wallet/on-chain (connect,
wallet link, loadout skill NFT, marketplace) jalan end-to-end: guest play
tanpa wallet tetap 100% didukung (CLAUDE.md), wallet hanya dipakai untuk
mode `standard` (loadout) dan `/market`.

**Status visual**: layout Tailwind utilitarian (spacing/hierarchy/loading-
error-disabled state/responsive dasar), BUKAN design system final — tim UI
silakan re-skin `components/`+`app/*` bebas (ganti class, markup, styling)
selama **logic tetap di `hooks/`+`lib/`** dan komponen tetap menerima data
lewat props/hook return value (lihat "Aturan pembagian kerja" di bawah).

Baca juga `../CLAUDE.md` (aturan main & arsitektur project),
`../server/API.md` (kontrak API lengkap — realtime + wallet link + loadout +
skill in-match) dan `../contracts/README.md` (kontrak on-chain yang dipakai
FE: Registry/Collection/Marketplace).

## Peta folder

```
src/
  app/            <- routes (Next App Router). Boleh dipoles bebas.
  components/     <- komponen, terima props, render markup. Boleh dipoles bebas.
  hooks/          <- state machine, socket, fetch orchestration, wagmi
                     wrappers. JANGAN diubah tanpa paham konsekuensinya.
  lib/            <- logic murni: socket client, HTTP client, localStorage,
                     chain/contract config, locale store. JANGAN diubah
                     tanpa paham konsekuensinya.
  i18n/strings.ts <- semua teks UI (id + en, id default). Nambah/ubah teks
                     di sini, JANGAN hardcode string di JSX.
```

**Aturan pembagian kerja**: `lib/` dan `hooks/` adalah "otak" — socket.io
client, HTTP fetch, viem/wagmi chain reads & writes, state reducer,
localStorage. `components/` dan `app/*` adalah "wajah" — menerima data lewat
props/hook return value dan render elemen HTML + Tailwind class. Kalau mau
memoles tampilan, cukup ubah className/markup di `components/` dan
`app/*` — tidak perlu (dan sebaiknya tidak) menyentuh apa pun di
`lib/`/`hooks/`. Board 5x5 (`DraftBoard`/`MatchBoard`) pakai Tailwind
`grid grid-cols-5` — ganti pendekatan lain sesukanya saat dipoles.

Beberapa komponen kecil menyimpan **local, UI-only state** yang murni
kosmetik (tidak pernah menyentuh socket/fetch): tombol "copied" di `Lobby`
(salin kode room) pakai `useState` lokal, dan `SkillPanel`'s countdown
window Nullify 15 detik pakai `useState`+`useEffect` (lihat komentar di
file itu — countdown ini approksimasi client-side, server tidak pernah
mengirim deadline pasti). Ini bukan pelanggaran "dumb component", cuma
bukan fetch/socket state.

### Detail tiap file baru di `lib/`

- `lib/chain.ts` — **satu-satunya tempat** definisi chain GIWA Sepolia
  (viem `defineChain`, id 91342), address kontrak (`contractAddresses` —
  default di-import LANGSUNG dari `contracts/deployments/91342.json` (relative
  import, sama seperti ABI di bawah) supaya tidak pernah drift dari deploy
  terakhir — redeploy berikutnya otomatis ke-pick up tanpa ubah kode FE;
  override via `NEXT_PUBLIC_*_ADDRESS`), ABI (`marketplaceAbi`/`skillCollectionAbi`/
  `skillFactoryAbi`/`skillRegistryAbi`, di-import langsung dari
  `contracts/abi/*.json` — lihat `contracts/README.md`), `publicClient`
  (viem, read-only, dipakai hooks katalog/ownership/sales/harga — tidak butuh
  wallet), `wagmiConfig` (injected connector ONLY, tanpa WalletConnect/
  cloud projectId, `ssr: true` supaya SSR Next tidak hydration-mismatch
  dengan wallet yang auto-reconnect di browser), plus helper
  `truncateAddress`/`explorerAddressUrl`/`explorerTxUrl`/`decodeEffectType`
  (bytes32 on-chain -> string "WILD_DAUB" dst).
- `lib/skillTier.ts` — klasifikasi tier kelangkaan skill murni dari
  `maxSupply` on-chain (`tierForMaxSupply`: ≤10 Super Rare, ≤100 Rare, ≤500
  Uncommon, sisanya Common) + map class Tailwind per tier (`TIER_BORDER_CLASS`/
  `TIER_BADGE_CLASS`) — dipakai bareng oleh `/market`, `/plaza` (kartu skill
  di chat), `/profile` (koleksi) lewat `SkillTierBadge`. Bukan konsep
  on-chain, murni hook visual "premium feel" (task brief) — tim UI bebas
  re-skin class-nya.
- `lib/locale.ts` — reactive locale store (id/en) di localStorage, pub-sub
  kecil (bukan React Context) supaya `hooks/useLocale.ts` bisa re-render
  semua consumer begitu language switcher (Header) diklik.
- `lib/plazaThreads.ts` — `groupPlazaThreads(messages)`: susun array flat
  `PlazaMessage[]` (kontrak server, kronologis oldest→newest) jadi thread
  ala X, `{ post, replies }[]`, post terbaru duluan, balasan di dalam
  thread tetap oldest→newest. Sebuah `PlazaMessage.replyTo` yang tidak
  merujuk id manapun di buffer (parent sudah age-out dari history buffer
  server, lihat `server/src/plaza/plaza.ts`) diperlakukan sebagai post
  biasa, bukan dibuang. Dipakai `hooks/usePlaza.ts` (expose sebagai
  `threads`), bukan komponen langsung.
- `lib/relativeTime.ts` — `relativeTime(at, strings, now?)`: label waktu
  relatif singkat ("2m", "1j"/"1h", "kemarin"/"yesterday", "3h"/"3d") dari
  timestamp `PlazaMessage.at` (epoch ms). Pure, `now` overridable. Semua
  teks lewat parameter `strings` (lihat `i18n/strings.ts`'s `plaza.time*`),
  fungsi ini sendiri tidak baca locale. Dipakai `PlazaPost`/`PlazaReply`.
- `lib/avatarTint.ts` — `avatarTint(nickname)`: warna avatar diturunkan
  dari hash nickname (nickname yang sama selalu dapat warna yang sama,
  tanpa state/storage). Sebelumnya inline di komponen chat lama, dipindah
  ke `lib/` begitu lebih dari satu komponen Plaza butuh (`PlazaAvatar`).
- `lib/boardSkins.ts` — `boardSkinsFrom(metadata, balances)`: board-number ->
  `{ imageUrl, skillName }` untuk skill yang DIMILIKI (`balance > 0n`, dari
  `useSkillOwnership`) DAN punya atribut `"Featured Number"` di metadata
  off-chain (`GET /metadata/:id.json`, server-side di
  `server/src/api/http.ts`'s `EFFECT_FEATURED_NUMBER` — sengaja TIDAK
  di-hardcode ulang di web, angka dibaca dari metadata). Skill tanpa atribut
  itu sekadar tidak punya skin, bukan error. Dua skill dengan Featured
  Number sama (belum terjadi hari ini — 5 skill, 5 angka berbeda) di-resolve
  ke skillId terkecil, deterministik. Pure, dipakai `hooks/useBoardSkins.ts`.

Existing (tidak diubah kontraknya, lihat `server/API.md`):

- `lib/socket.ts` — singleton typed Socket.IO client.
- `lib/api.ts` — wrapper fetch HTTP JSON API (daily/quests).
- `lib/storage.ts` — localStorage nickname/playerId.
- `lib/roomPhase.ts` — derivasi fase UI dari `LobbyView`+`match:ended`.

### Detail tiap hook baru di `hooks/`

- `hooks/useWallet.ts` — wrapper wagmi (`useAccount`/`useConnect`/
  `useDisconnect`/`useSignMessage`/`useSwitchChain`), satu tempat resolusi
  "pakai connector mana" (injected pertama yang terdaftar) + deteksi
  `wrongNetwork`. Dipakai `Header`, `/play` (link wallet), `/market`.
- `hooks/useSkillCatalog.ts` — baca katalog skill on-chain
  (`SkillRegistry.nextSkillId` lalu `getSkill` 1..n) via `lib/chain.ts`'s
  `publicClient` — tidak butuh wallet. `enabled` param (default true)
  supaya room `casual` tidak melakukan RPC call sama sekali. Dipakai
  loadout picker (`/play`) dan `/market`.
- `hooks/useSkillOwnership.ts` — `SkillCollection.balanceOfBatch(owner,
  skillIds)`, no-op (map kosong) kalau `owner` undefined/`skillIds` kosong.
  Dipakai `/play` (loadout picker), `/market` (saldo kamu), `/plaza`
  (skill yang bisa dilampirkan), `/profile/[address]` (koleksi).
- `hooks/useMarketplaceSales.ts` — `Marketplace.sales(skillId)` per skill
  (Marketplace v2: `basePrice`/`maxSupply`/`minted`/`active`/`lastPurchaseAt`)
  — stok + harga dasar (BUKAN quote pembelian, lihat `useSkillPrices.ts`).
  Dipakai `/market`, `/plaza` (tier dari `maxSupply`), `/profile/[address]`.
- `hooks/useSkillPrices.ts` — `Marketplace.priceOf(skillId)`, SATU-SATUNYA
  sumber quote harga (contracts/README.md: "FE HARUS quote lewat priceOf,
  jangan pernah hitung harga manual dari basePrice" — harga bergerak dengan
  scarcity ramp + demand decay). Refetch tiap 30 detik selama halaman
  terbuka + `reload()` manual (dipanggil `/market` setelah tx beli confirm).
- `hooks/useSkillMetadata.ts` — fetch `GET <NEXT_PUBLIC_SERVER_URL>/metadata/
  <id>.json` (server/API.md) per skill — name/description/image/
  animation_url (CONCEPT.md §3 "identitas premium"). Murni dekoratif: id
  yang gagal/404/503 diam-diam absen dari map, caller fallback ke nama dari
  `effectNames` (i18n) — tidak pernah jadi error halaman.
- `hooks/useBuySkill.ts` — wraps `useWriteContract`+
  `useWaitForTransactionReceipt` jadi satu status pembelian
  (`isSubmitting`/`isConfirming`/`isConfirmed`/`error`/`hash`) untuk
  `Marketplace.buy(skillId, amount)`. `buy(skillId, amount, quotedUnitPriceWei)`
  mengirim `msg.value = quote * amount * 1.02` (buffer 2% — kontrak
  auto-refund kelebihan, CEI, lihat contracts/README.md's Dynamic Pricing).
- `hooks/usePlaza.ts` — state Plaza feed global (server/API.md's "Plaza
  chat"): connect/disconnect socket di mount/unmount halaman `/plaza`
  (singleton yang sama dengan `useRoom.ts`, lihat `lib/socket.ts`),
  `plaza:history` sekali saat connect, listen `plaza:message` (broadcast ke
  SEMUA socket termasuk pengirim sendiri — jadi tidak perlu optimistic
  local append), `send(nickname, text, skillId?)` untuk post baru,
  **`reply(nickname, text, parentId, skillId?)`** untuk balasan (`plaza:send`
  dengan `replyTo`), plus **`threads`** — hasil `lib/plazaThreads.ts`'s
  `groupPlazaThreads(messages)`, di-memo dari `messages` yang sama.
- `hooks/useLocale.ts` — baca `lib/locale.ts` via `useSyncExternalStore`
  (SSR-safe, snapshot server selalu "id").
- `hooks/useBoardSkins.ts` — hook tipis yang merakit `useSkillCatalog` +
  `useSkillMetadata` + `useSkillOwnership` + `useWallet` jadi satu
  `ReadonlyMap<number, BoardSkin>` siap pakai (`lib/boardSkins.ts`'s
  `boardSkinsFrom`), untuk `DraftBoard`/`MatchBoard` mewarnai sel board
  dengan artwork skill yang dimiliki pemain (skin kosmetik, board lawan
  tetap tidak pernah terkirim). Berlaku di semua mode (termasuk casual) —
  ini soal kepemilikan wallet, bukan loadout match. Wallet belum connect ->
  ketiga hook di bawahnya no-op (`enabled false`/owner undefined/id list
  kosong) dan hook ini mengembalikan map kosong, jadi guest play tidak
  memicu RPC/HTTP tambahan apa pun.

Existing (tidak diubah logic-nya, hanya ditambah action baru — lihat di
bawah):

- `hooks/useRoom.ts` — state machine utama `/play`. Actions:
  `createRoom(nickname, mode?, { maxPlayers?, isPublic? })`, `joinRoom`,
  **`quickMatch(nickname, size)`** (`room:quick` — auto-join/auto-buat room
  publik 2–5, draft mulai otomatis saat penuh), **`createBotRoom(nickname,
  level)`** (`room:createBot` — 1v1 vs bot Lv1–10, langsung draft),
  **`listRooms()`** (`room:list`, Promise-based untuk Room Browser di
  landing), `linkWallet(address, signMessage)` (flow `wallet:nonce` → sign →
  `wallet:link`), `setLoadout(skillIds)`, plus semua action lama
  (`draft:start`/`match:call`/`skill:use`/dst). State menyimpan `entryKind`
  (`"create" | "join" | "quick" | "bot"`) — dipakai "Main Lagi" untuk
  mengulang mode yang sama dan Lobby untuk tahu room quick match (tanpa
  tombol host).
- `hooks/useDraftBoard.ts` — susun board: `selectCell` (klik 2 sel untuk
  tukar) dan **`swapCells(a, b)`** (dipakai juga drag & drop di
  `DraftBoard`).
- `hooks/useDailyChallenge.ts`, `hooks/useQuests.ts`,
  `hooks/useStoredPlayerId.ts` — tidak diubah.

## Cara jalanin

```bash
# dari root repo
pnpm --filter @thebingofi/server dev   # server di :3001 (PORT bebas)
pnpm --filter @thebingofi/web dev      # web di :3000 (Next --port bebas)
```

Buka `http://localhost:3000`. Guest play, tidak perlu wallet/login apa pun.
Untuk fitur wallet (link/loadout/market), perlu extension wallet injected
(MetaMask dkk) di browser, network GIWA Sepolia (chain id 91342) — app akan
menawarkan "Pindah ke GIWA Sepolia" otomatis lewat `wallet_addEthereumChain`
kalau wallet belum kenal chain ini.

## Environment

Copy `.env.example` ke `.env.local`:

```
NEXT_PUBLIC_SERVER_URL=http://localhost:3001
```

`NEXT_PUBLIC_RPC_URL`/`NEXT_PUBLIC_REGISTRY_ADDRESS`/
`NEXT_PUBLIC_FACTORY_ADDRESS`/`NEXT_PUBLIC_COLLECTION_ADDRESS`/
`NEXT_PUBLIC_MARKETPLACE_ADDRESS` opsional — default dibaca langsung dari
`contracts/deployments/91342.json` (lihat `lib/chain.ts` + `.env.example`),
otomatis ikut redeploy terbaru; hanya perlu diisi untuk target
RPC/deployment lain.

## Halaman

- `/` — landing/hub: nickname + **4 kartu mode**: Quick Match (pilih 2–5
  pemain → `/play?quick=N`), Room Terbuka (browser room publik via
  `listRooms()`, auto-refresh 10s, join → `/play?code=...`), Buat Room
  (target pemain 2–5, casual/standard, publik/privat), VS Bot (grid level
  1–10 → `/play?bot=N`), plus form "Gabung via Kode".
- `/play` — seluruh flow room: lobby ("X/Y pemain", badge Publik/Privat/BOT,
  quick match auto-start tanpa tombol host; + link wallet & loadout picker
  kalau mode `standard`) → draft (klik 2 sel ATAU drag & drop) → playing
  (**board sendiri = number picker**: klik sel yang belum ter-mark saat
  giliranmu — tidak ada grid 1–25 terpisah; huruf **B-I-N-G-O** per garis
  lengkap, besar untuk diri sendiri + compact per pemain; skill panel,
  banner Nullify) → finished (+ "Main Lagi" mengulang mode yang sama; +
  "Bagikan ke Plaza" — hanya muncul untuk match yang selesai organik/ada
  `winnerId`, kirim `plaza:send` dengan `attachment: {kind:"result", won,
  lines, calls, opponent?}` dari `MatchView`/`MatchEndedPayload` yang sudah
  ada di `hooks/useRoom.ts` — bukan angka karangan — lalu redirect ke
  `/plaza`, lihat `hooks/usePlazaShare.ts`). Board pemain sendiri disimpan
  ke `lib/storage.ts` (`setStoredLastBoard`, via `lib/matchShare.ts`'s
  `boardAttachmentFrom`) tiap match selesai, terlepas dari tombol share
  ditekan atau tidak — itu yang menyuplai opsi "lampirkan Board" di
  composer `/plaza`. Baca `?code=`/`?mode=`/`?quick=`/`?bot=` dari URL.
  Lihat `hooks/useRoom.ts`.
- `/daily` — Daily Challenge: susun board (reuse `DraftBoard`), main, lihat
  skor + share card + leaderboard.
- `/quests` — katalog quest + progress bar per quest.
- `/market` — katalog skill on-chain + harga dinamis (`Marketplace.priceOf`,
  refetch berkala + badge "Diskon x%"/"Harga naik (laris)" vs `basePrice`) +
  stok dengan progress bar + tier kelangkaan (`lib/skillTier.ts`, dari
  `maxSupply`) + metadata off-chain (`GET /metadata/:id.json` — name/
  description, `image`/`animation_url` dengan fallback inisial lewat
  `SkillMedia`) + saldo kamu (`SkillCollection.balanceOfBatch`) + beli
  (`Marketplace.buy`, kirim quote×amount×1.02, kelebihan auto-refund).
  Tanpa wallet: katalog tetap kelihatan, tombol beli nonaktif + ajakan
  connect. Sold out → tombol disabled.
- `/plaza` — feed sosial global ala X/Twitter (CONCEPT.md §7.4b), realtime
  via `plaza:send`/`plaza:history`/`plaza:message` (server/API.md). Server
  tetap mengirim histori FLAT & kronologis (`PlazaMessage[]`, opsional
  `replyTo` — kedalaman maks 1 level); pengelompokan jadi thread (post +
  balasannya, post terbaru duluan) murni logic klien
  (`lib/plazaThreads.ts`, di-expose `hooks/usePlaza.ts` sebagai `threads`).
  Guest play penuh untuk posting/membalas (nickname dari storage, diminta
  inline kalau kosong — gerbangnya hanya menutup composer, feed tetap
  kebaca tanpa nickname).

  **Lampiran** (`attachment: PlazaAttachment`, `@thebingofi/server/protocol`
  — union `kind: "skill" | "result" | "board"`; server menormalisasi pesan
  lama ber-`skillId` jadi `attachment: {kind:"skill", skillId}`, jadi klien
  cukup baca `message.attachment`) dirender sebagai kartu ala Twitter Card
  lewat `PlazaAttachmentCard` (satu switch per `kind`, dipakai `PlazaPost`
  dan `PlazaReply`):
  - **Skill** (`PlazaSkillAttachment`) — kartu besar: artwork asli dari
    `GET /metadata/:id.json` (`hooks/useSkillMetadata.ts`, lewat
    `SkillMedia` yang sudah punya fallback inisial), nama, badge tier
    (`lib/skillTier.ts`), klik → `/market`. Menggantikan `PlazaSkillCard`
    lama (dihapus).
  - **Result** (`PlazaResultAttachment`) — status menang/kalah menonjol,
    garis sebagai huruf B-I-N-G-O (`BingoLetters` varian `compact`), jumlah
    panggilan, nama lawan kalau ada satu yang jelas.
  - **Board** (`PlazaBoardAttachment`) — mini board 5×5 dari `numbers` +
    `marked`, SENGAJA polos tanpa skin artwork: skin milik penulis post,
    tapi `PlazaMessage` tidak membawa address-nya, jadi tidak ada cara
    tahu skin apa yang dia punya (lihat komentar di komponennya).

  Composer (`PlazaComposer`) bisa melampirkan salah satu (bukan
  keduanya — sama seperti wire shape `PlazaAttachment`, satu field): dropdown
  "Lampirkan skill" (skill yang DIMILIKI wallet, seperti sebelumnya — tanpa
  wallet, opsi ini tidak muncul) dan tombol toggle "Lampirkan board" (board
  terakhir pemain dari `lib/storage.ts`, kalau ada — tidak butuh wallet).
  Memilih salah satu menampilkan pratinjau PERSIS memakai komponen kartu
  yang sama (WYSIWYG) plus tombol hapus lampiran. Balas membuka composer
  inline di dalam thread (bukan pindah halaman, dan TANPA menu lampirkan —
  tetap ringan ala kotak balasan X); thread dengan banyak balasan
  menampilkan 2 teratas + tombol perluas. Rate limit server ditampilkan
  sebagai error banner.
- `/profile/[address]` — profil publik shareable (CONCEPT.md §7.4b):
  validasi address (viem `isAddress`, invalid → 404 lewat `notFound()`),
  koleksi skill on-chain (`balanceOfBatch` seluruh katalog) + tier badge +
  total item, tombol share (copy link, X, Telegram — teks "Cek koleksi
  skill TheBingoFi-ku"). `generateMetadata` per address (title/description
  dinamis) — Server Component (`page.tsx`) + Client Component
  (`components/ProfileView.tsx`) untuk baca on-chain/`window`/`navigator`.

Header (semua halaman, `components/Header.tsx`, dipasang di
`app/layout.tsx`): link antar halaman (termasuk Plaza), link "Profilku" →
`/profile/<wallet>` (disabled kalau belum connect), tombol
Connect/Disconnect + address terpotong + peringatan jaringan salah,
language switcher (id/en). Nickname pemain yang sudah `wallet:link` juga
jadi link ke profilnya di `/play` lobby (`PlayerList`/`Lobby`) — `/plaza`
tidak (payload `PlazaMessage` tidak membawa address, lihat server/API.md).

## Komponen (`src/components/`)

| Komponen | Props | Dipakai di |
|---|---|---|
| `Header` | (tidak ada — baca wagmi/locale langsung) | semua halaman (`app/layout.tsx`) |
| `Providers` | `children` | `app/layout.tsx` (WagmiProvider + QueryClientProvider) |
| `Lobby` | `code, players, hostId, mode, maxPlayers, visibility, isQuickMatch, playerId, isHost, canStart, pending, onStartDraft, onLeave, connectedWalletAddress?, walletLinkPending?, onLinkWallet?, loadoutPicker?` | `/play` (fase lobby) |
| `PlayerList` | `players, hostId, mode?` (render badge BOT utk `isBot`) | `Lobby`, `/play` (fase draft) |
| `LoadoutPicker` | `catalog, ownedSkillIds, selected, savedLoadout, catalogLoading, catalogError, saving, onToggle, onSave` | `Lobby` (slot `loadoutPicker`, mode standard) |
| `DraftBoard` | `numbers, selectedIndex, onSelectCell, onSwapCells, onShuffle, valid, validationError?, skins?` (klik 2 sel + drag & drop; `skins` dari `useBoardSkins` — sel ber-skin pakai artwork skill + scrim + text-shadow, tetap terbaca) | `/play` (fase draft), `/daily` (tanpa `skins`) |
| `MatchBoard` | `view (MatchView), playerId, onCall, pending, skillSelection?, onSelectSkillCell?, skins?` — board sendiri = number picker; huruf BINGO via `BingoLetters`; `skins` sama seperti `DraftBoard` | `/play` (fase playing) |
| `BingoLetters` | `count, compact?` (1 garis = B ... 5 = BINGO) | `MatchBoard` |
| `SkillPanel` | `view (MatchView), viewerPlayerId, pending, selection, resolutions, onActivateSkill, onCancelSelection, onNullify, onPass` | `/play` (fase playing) |
| `MatchResult` | `winnerId, reason?, players, onBackToLanding, onPlayAgain?, onShareToPlaza?, sharePending?, shareError?` | `/play` (fase finished) |
| `QuestNotifications` | `notifications (QuestCompletedPayload[])` | `/play` |
| `DailyResult` | `number, score, callsToBingo, shareCard, copied, onCopy` | `/daily` |
| `DailyLeaderboard` | `entries (DailyLeaderboardEntry[])` | `/daily` |
| `QuestList` | `quests, progress` | `/quests` |
| `SkillMarketCard` | `entry, sale, currentPrice, priceLoading, metadata, ownedBalance, amount, onAmountChange, walletConnected, buyDisabled, buyStatus, buyError, txHash, onBuy` | `/market` |
| `SkillMedia` | `imageUrl?, animationUrl?, label` | `SkillMarketCard` — art slot dengan fallback inisial (`onError`) |
| `SkillTierBadge` | `tier` | `SkillMarketCard`, `PlazaSkillAttachment`, `ProfileSkillCard` |
| `PlazaFeed` | `threads (readonly PlazaThread[]), skillName, skillTier, skillImage, nickname, sending, onReply(parentId, text, attachment?)` | `/plaza` |
| `PlazaPost` | `post (PlazaMessage), replies (readonly PlazaMessage[]), skillName, skillTier, skillImage, nickname, sending, onReply(text, attachment?)` | `PlazaFeed` (satu per thread) |
| `PlazaReply` | `reply (PlazaMessage), skillName, skillTier, skillImage` | `PlazaPost` (satu per balasan) |
| `PlazaComposer` | `nickname, placeholder, submitLabel, sending, onSubmit(text, attachment?), skillPicker? { label, noneLabel, options: {skillId, label, name, imageUrl?, tier?}[] }, boardOption? { label, activeLabel, numbers, marked }, removeAttachmentLabel?, compact?, onCancel?, cancelLabel?, autoFocus?` | `/plaza` (composer utama, dengan `skillPicker`/`boardOption`), `PlazaPost` (composer balasan inline, `compact`, tanpa menu lampirkan) |
| `PlazaAvatar` | `nickname, className?` (ukuran/text-size lewat class, warna dari `lib/avatarTint.ts`) | `PlazaComposer`, `PlazaPost`, `PlazaReply` |
| `PlazaAttachmentCard` | `attachment (PlazaAttachment), skillName, skillTier, skillImage` — satu switch per `kind` | `PlazaPost`, `PlazaReply` (pesan/balasan dengan `attachment`) |
| `PlazaSkillAttachment` | `skillId, name, imageUrl?, tier?` — kartu besar, artwork asli lewat `SkillMedia` | `PlazaAttachmentCard`, `PlazaComposer` (pratinjau) |
| `PlazaResultAttachment` | `won, lines, calls, opponent?` | `PlazaAttachmentCard` |
| `PlazaBoardAttachment` | `numbers, marked?` — mini board 5×5, sengaja tanpa skin (lihat komentar di komponen) | `PlazaAttachmentCard`, `PlazaComposer` (pratinjau) |
| `ProfileView` | `address` | `app/profile/[address]/page.tsx` (Client Component body) |
| `ProfileSkillCard` | `entry, balance, tier` | `ProfileView` |

Semua komponen di atas (kecuali `Header`/`Providers`, yang genuinely
cross-cutting) tetap "dumb": tidak ada fetch/socket langsung, cuma
menerima props dan me-render markup + memanggil callback yang di-pass dari
`app/*/page.tsx` (yang mengorkestrasi hooks). `Header` baca `useWallet`/
`useLocale` langsung karena wallet/locale state bukan milik satu
halaman/hook manapun.

## Tipe dari server (jangan duplikat)

- `import type { ... } from "@thebingofi/server/protocol"` — semua tipe
  event Socket.IO (`ClientToServerEvents`, `ServerToClientEvents`,
  `LobbyView`, `MatchView`, `PlazaMessage`, `SkillMetadataResponse`, dst).
- `import { ... } from "@thebingofi/server/engine"` — fungsi/konstanta pure
  engine (`validateBoard`, `BOARD_SIZE`, `MIN_NUMBER`, `MAX_NUMBER`,
  `MIN_PLAYERS`, `WILD_DAUB`/`CELL_SWAP`/dst, `markedCellsFor`).
- JANGAN `import ... from "@thebingofi/server"` (root) — itu menarik
  `socket.io` (server) ke bundle browser.
- ABI kontrak: `import ... from "../../../contracts/abi/*.json"` (lihat
  `lib/chain.ts`) — sesuai `contracts/README.md`: "File-file ini yang
  di-import langsung oleh web/". Address kontrak JANGAN di-hardcode di luar
  `lib/chain.ts`.

## Verifikasi

```bash
pnpm --filter @thebingofi/web exec tsc --noEmit
pnpm --filter @thebingofi/web exec eslint .
pnpm --filter @thebingofi/web build
```

Ketiganya harus bersih sebelum PR. Wallet/marketplace flow (connect, sign,
buy) butuh browser+wallet extension sungguhan untuk diuji manual — tidak
bisa diuji headless; struktur kode (typecheck+build) adalah jaminan yang
tersedia di CI.

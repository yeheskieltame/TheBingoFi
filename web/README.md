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
  default ke deployment live `contracts/deployments/91342.json`, override
  via `NEXT_PUBLIC_*_ADDRESS`), ABI (`marketplaceAbi`/`skillCollectionAbi`/
  `skillFactoryAbi`/`skillRegistryAbi`, di-import langsung dari
  `contracts/abi/*.json` — lihat `contracts/README.md`), `publicClient`
  (viem, read-only, dipakai hooks katalog/ownership/sales — tidak butuh
  wallet), `wagmiConfig` (injected connector ONLY, tanpa WalletConnect/
  cloud projectId, `ssr: true` supaya SSR Next tidak hydration-mismatch
  dengan wallet yang auto-reconnect di browser), plus helper
  `truncateAddress`/`explorerAddressUrl`/`explorerTxUrl`/`decodeEffectType`
  (bytes32 on-chain -> string "WILD_DAUB" dst).
- `lib/locale.ts` — reactive locale store (id/en) di localStorage, pub-sub
  kecil (bukan React Context) supaya `hooks/useLocale.ts` bisa re-render
  semua consumer begitu language switcher (Header) diklik.

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
- `hooks/useMarketplaceSales.ts` — `Marketplace.sales(skillId)` per skill
  (price/maxSupply/minted/active) — dipakai `/market`.
- `hooks/useBuySkill.ts` — wraps `useWriteContract`+
  `useWaitForTransactionReceipt` jadi satu status pembelian
  (`isSubmitting`/`isConfirming`/`isConfirmed`/`error`/`hash`) untuk
  `Marketplace.buy(skillId, amount)`.
- `hooks/useLocale.ts` — baca `lib/locale.ts` via `useSyncExternalStore`
  (SSR-safe, snapshot server selalu "id").

Existing (tidak diubah logic-nya, hanya ditambah action baru — lihat di
bawah):

- `hooks/useRoom.ts` — state machine utama `/play`. **Ditambah** 2 action
  baru dibanding sebelumnya: `linkWallet(address, signMessage)` (flow
  `wallet:nonce` -> sign -> `wallet:link`, `signMessage` di-inject dari
  `useWallet` supaya hook ini tetap tidak mengimpor wagmi) dan
  `setLoadout(skillIds)` (`loadout:set`). `createRoom` sekarang menerima
  `mode?: "casual" | "standard"` (dulu selalu casual). Semua action lama
  (`joinRoom`/`draft:start`/`match:call`/`skill:use`/dst) tidak berubah.
- `hooks/useDraftBoard.ts`, `hooks/useDailyChallenge.ts`,
  `hooks/useQuests.ts`, `hooks/useStoredPlayerId.ts` — tidak diubah.

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
`NEXT_PUBLIC_MARKETPLACE_ADDRESS` opsional — default sudah hardcode ke
deployment live GIWA Sepolia (lihat `lib/chain.ts` + `.env.example`), hanya
perlu diisi untuk target RPC/deployment lain.

## Halaman

- `/` — landing/hub: nickname, pilih mode room (casual/standard) + "Buat
  Room" (→ `/play`), form "Gabung via Kode" (→ `/play?code=...`), link ke
  `/daily`, `/quests`, `/market`.
- `/play` — seluruh flow room: lobby (+ link wallet & loadout picker kalau
  mode `standard`) → draft → playing (board, skill panel, giliran) →
  finished (+ "Main Lagi"). Baca `?code=`/`?mode=` dari URL. Lihat
  `hooks/useRoom.ts`.
- `/daily` — Daily Challenge: susun board (reuse `DraftBoard`), main, lihat
  skor + share card + leaderboard.
- `/quests` — katalog quest + progress bar per quest.
- `/market` — katalog skill on-chain + harga/stok (`Marketplace.sales`) +
  saldo kamu (`SkillCollection.balanceOf`) + beli (`Marketplace.buy`).
  Tanpa wallet: katalog tetap kelihatan, tombol beli nonaktif + ajakan
  connect.

Header (semua halaman, `components/Header.tsx`, dipasang di
`app/layout.tsx`): link antar halaman, tombol Connect/Disconnect + address
terpotong + peringatan jaringan salah, language switcher (id/en).

## Komponen (`src/components/`)

| Komponen | Props | Dipakai di |
|---|---|---|
| `Header` | (tidak ada — baca wagmi/locale langsung) | semua halaman (`app/layout.tsx`) |
| `Providers` | `children` | `app/layout.tsx` (WagmiProvider + QueryClientProvider) |
| `Lobby` | `code, players, hostId, mode, playerId, isHost, canStart, pending, onStartDraft, onLeave, connectedWalletAddress?, walletLinkPending?, onLinkWallet?, loadoutPicker?` | `/play` (fase lobby) |
| `PlayerList` | `players, hostId, mode?` | `Lobby`, `/play` (fase draft) |
| `LoadoutPicker` | `catalog, ownedSkillIds, selected, savedLoadout, catalogLoading, catalogError, saving, onToggle, onSave` | `Lobby` (slot `loadoutPicker`, mode standard) |
| `DraftBoard` | `numbers, selectedIndex, onSelectCell, onShuffle, valid, validationError?` | `/play` (fase draft), `/daily` |
| `MatchBoard` | `view (MatchView), playerId, onCall, pending, skillSelection?, onSelectSkillCell?` | `/play` (fase playing) |
| `SkillPanel` | `view (MatchView), viewerPlayerId, pending, selection, resolutions, onActivateSkill, onCancelSelection, onNullify, onPass` | `/play` (fase playing) |
| `MatchResult` | `winnerId, reason?, players, onBackToLanding, onPlayAgain?` | `/play` (fase finished) |
| `QuestNotifications` | `notifications (QuestCompletedPayload[])` | `/play` |
| `DailyResult` | `number, score, callsToBingo, shareCard, copied, onCopy` | `/daily` |
| `DailyLeaderboard` | `entries (DailyLeaderboardEntry[])` | `/daily` |
| `QuestList` | `quests, progress` | `/quests` |
| `SkillMarketCard` | `entry, sale, ownedBalance, amount, onAmountChange, walletConnected, buyDisabled, buyStatus, buyError, txHash, onBuy` | `/market` |

Semua komponen di atas (kecuali `Header`/`Providers`, yang genuinely
cross-cutting) tetap "dumb": tidak ada fetch/socket langsung, cuma
menerima props dan me-render markup + memanggil callback yang di-pass dari
`app/*/page.tsx` (yang mengorkestrasi hooks). `Header` baca `useWallet`/
`useLocale` langsung karena wallet/locale state bukan milik satu
halaman/hook manapun.

## Tipe dari server (jangan duplikat)

- `import type { ... } from "@thebingofi/server/protocol"` — semua tipe
  event Socket.IO (`ClientToServerEvents`, `ServerToClientEvents`,
  `LobbyView`, `MatchView`, dst).
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

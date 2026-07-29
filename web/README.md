# TheBingoFi — web

Frontend Next.js (App Router, TS strict) untuk TheBingoFi. Status saat ini:
**kerangka fungsional tanpa styling** — semua flow (room realtime, daily
challenge, quests) benar-benar jalan end-to-end lewat `@thebingofi/server`,
tapi markup-nya sengaja polos (elemen semantik, nol class Tailwind, nol CSS
baru) supaya tim UI bisa memoles tampilan tanpa perlu paham socket/fetch di
baliknya.

Baca juga `../CLAUDE.md` (aturan main & arsitektur project) dan
`../server/API.md` (kontrak API lengkap — sumber kebenaran untuk setiap
event/endpoint yang dipakai di sini).

## Peta folder

```
src/
  app/            <- routes (Next App Router). Boleh dipoles.
  components/     <- komponen dumb, terima props, render markup. Boleh dipoles.
  hooks/          <- state machine, socket, fetch orchestration. JANGAN diubah
                     tanpa paham konsekuensinya - ini "otak" tiap halaman.
  lib/            <- logic murni: socket client, HTTP client, localStorage,
                     derivasi phase. JANGAN diubah tanpa paham konsekuensinya.
  i18n/strings.ts <- semua teks UI (id + en, id yang dipakai saat ini).
                     Nambah/ubah teks di sini, JANGAN hardcode string di JSX.
```

**Aturan pembagian kerja**: `lib/` dan `hooks/` adalah "otak" — socket.io
client, HTTP fetch, state reducer, localStorage. `components/` dan `app/*`
adalah "wajah" — cuma menerima data lewat props/hook return value dan
me-render elemen HTML semantik (`h1`/`h2`, `form`, `fieldset`, `button`,
`table`, `ul`, `dl`, dst). Kalau mau memoles tampilan, cukup tambah
class/style di `components/` dan `app/*` — tidak perlu (dan sebaiknya tidak)
menyentuh apa pun di `lib/`/`hooks/`. Satu pengecualian styling yang sudah
ada: grid 5x5 board pakai
`style={{ display: "grid", gridTemplateColumns: "repeat(5,2rem)" }}` supaya
kebaca sebagai grid dari awal — boleh diganti pendekatan lain (CSS Grid via
class, dst) saat dipoles.

### Detail tiap file di `lib/`

- `lib/socket.ts` — singleton typed Socket.IO client (`Socket<ServerToClientEvents, ClientToServerEvents>` dari `@thebingofi/server/protocol`). `autoConnect: false`; `hooks/useRoom.ts` yang connect/disconnect.
- `lib/api.ts` — wrapper `fetch` typed ke `{ ok, data } | { ok, error }` (amplop JSON server) + fungsi per endpoint HTTP (`getDailyToday`, `postDailyPlay`, `getDailyLeaderboard`, `getQuests`, `getQuestProgress`). Tipe daily/quest didefinisikan lokal di sini mengikuti `server/API.md` — server belum expose subpath `./daily`/`./quest` seperti `./protocol`/`./engine`.
- `lib/storage.ts` — baca/tulis `localStorage`: nickname (diisi di landing) dan playerId terakhir (diisi saat room create/join, dipakai `/quests`).
- `lib/roomPhase.ts` — fungsi murni yang menentukan fase UI (`lobby`/`draft`/`playing`/`finished`) dari `LobbyView` + `match:ended` terakhir.

### Detail tiap file di `hooks/`

- `hooks/useRoom.ts` — state machine utama `/play`: connect socket, `room:create`/`room:join`/`room:leave`/`draft:start`/`draft:submit`/`match:call`, plus listener `room:state`/`match:state`/`match:ended`/`quest:completed`. Return `{ state, phase, createRoom, joinRoom, leaveRoom, startDraft, submitDraft, callNumber, clearError }`.
- `hooks/useDraftBoard.ts` — state board 5x5 saat menyusun angka (klik-dua-sel-untuk-tukar, acak, validasi realtime pakai `validateBoard` dari `@thebingofi/server/engine`). Dipakai ulang oleh `/play` (fase draft) dan `/daily`.
- `hooks/useDailyChallenge.ts` — `GET /daily/today` + `GET /daily/leaderboard` saat mount, `play(nickname, board)` untuk `POST /daily/play`.
- `hooks/useQuests.ts` — `GET /quests` saat mount, plus `GET /quests/progress/:playerId` kalau ada playerId tersimpan.
- `hooks/useStoredPlayerId.ts` — baca playerId dari localStorage lewat `useSyncExternalStore` (SSR-safe, hindari hydration mismatch).

## Cara jalanin

```bash
# dari root repo
pnpm --filter @thebingofi/server dev   # server di :3001 (PORT bebas)
pnpm --filter @thebingofi/web dev      # web di :3000 (Next --port bebas)
```

Buka `http://localhost:3000`. Guest play, tidak perlu wallet/login apa pun.

## Environment

Copy `.env.example` ke `.env.local`:

```
NEXT_PUBLIC_SERVER_URL=http://localhost:3001
```

Dipakai oleh `lib/socket.ts` (Socket.IO) dan `lib/api.ts` (fetch). Kalau
server jalan di port lain, ubah nilai ini.

## Halaman

- `/` — landing: input nickname (localStorage), "Buat Room" (→ `/play`),
  form "Gabung via Kode" (→ `/play?code=...`), link `/daily` & `/quests`,
  tombol Connect Wallet (disabled, "segera").
- `/play` — seluruh flow room: lobby → draft → playing → finished. Baca
  `?code=` dari URL untuk tahu create vs join. Lihat `hooks/useRoom.ts`.
- `/daily` — Daily Challenge: susun board (reuse `DraftBoard`), main, lihat
  skor + share card + leaderboard.
- `/quests` — katalog quest + progress pemain (kalau ada sesi main
  tersimpan).

## Komponen (`src/components/`)

| Komponen | Props | Dipakai di |
|---|---|---|
| `Lobby` | `code, players, hostId, isHost, canStart, pending, onStartDraft, onLeave` | `/play` (fase lobby) |
| `PlayerList` | `players, hostId` | `Lobby`, `/play` (fase draft) |
| `DraftBoard` | `numbers, selectedIndex, onSelectCell, onShuffle, valid, validationError?` | `/play` (fase draft), `/daily` |
| `MatchBoard` | `view (MatchView), playerId, onCall, pending` | `/play` (fase playing) |
| `MatchResult` | `winnerId, reason?, players, onBackToLanding` | `/play` (fase finished) |
| `QuestNotifications` | `notifications (QuestCompletedPayload[])` | `/play` |
| `DailyResult` | `number, score, callsToBingo, shareCard, copied, onCopy` | `/daily` |
| `DailyLeaderboard` | `entries (DailyLeaderboardEntry[])` | `/daily` |
| `QuestList` | `quests, progress` | `/quests` |

Semua komponen di atas "dumb": tidak ada `useEffect`/fetch/socket di
dalamnya, cuma menerima props dan me-render markup polos + memanggil
callback yang di-pass dari `app/*/page.tsx`.

## Tipe dari server (jangan duplikat)

- `import type { ... } from "@thebingofi/server/protocol"` — semua tipe
  event Socket.IO (`ClientToServerEvents`, `ServerToClientEvents`,
  `LobbyView`, `MatchView`, dst).
- `import { ... } from "@thebingofi/server/engine"` — fungsi/konstanta pure
  engine (`validateBoard`, `BOARD_SIZE`, `MIN_NUMBER`, `MAX_NUMBER`,
  `MIN_PLAYERS`, dst).
- JANGAN `import ... from "@thebingofi/server"` (root) — itu menarik
  `socket.io` (server) ke bundle browser.
- `next.config.ts` punya `transpilePackages: ["@thebingofi/server"]` karena
  export server itu file `.ts` mentah, bukan hasil build.

## Verifikasi

```bash
pnpm --filter @thebingofi/web exec tsc --noEmit
pnpm --filter @thebingofi/web exec eslint .
pnpm --filter @thebingofi/web build
```

Ketiganya harus bersih sebelum PR.

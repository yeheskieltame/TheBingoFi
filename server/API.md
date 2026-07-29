# TheBingoFi Server API

Dokumen ini untuk developer frontend (Next.js + `socket.io-client` +
`wagmi`/`viem`) yang mengonsumsi `server/`. Server ini **authoritative**:
semua aturan main (giliran, validasi board, deteksi menang, skor daily
challenge) divalidasi ulang di server — client tidak pernah dipercaya.

Dua permukaan API:

1. **Realtime (Socket.IO)** — room/matchmaking, draft phase, match berjalan.
2. **HTTP JSON** — daily challenge (baca/main/leaderboard) dan quest, tanpa
   perlu koneksi socket yang persisten.

Keduanya jalan di port yang sama (`PORT`, default `3001`), lihat
`server/src/index.ts`.

---

## 1. Realtime (Socket.IO)

### Connect

```ts
import { io } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "@thebingofi/server/protocol";

const socket = io("http://localhost:3001", {
  // guest play: tidak perlu auth/token apa pun untuk mulai main.
}) as import("socket.io-client").Socket<ServerToClientEvents, ClientToServerEvents>;
```

> Catatan tipe: generic `Socket<ListenEvents, EmitEvents>` dari
> `socket.io-client` urutannya **kebalikan** dari `socket.io` sisi server
> (`Server<ClientToServerEvents, ServerToClientEvents>`) — sisi client
> *mendengarkan* `ServerToClientEvents` dan *mengirim* `ClientToServerEvents`.

`ClientToServerEvents`/`ServerToClientEvents` (plus semua tipe view seperti
`LobbyView`, `MatchView`) diekspor dari `@thebingofi/server/protocol` — satu
sumber kebenaran yang sama persis dipakai server untuk mengetik
`new Server<...>(...)`, jadi tidak akan pernah drift dari implementasi
sungguhan.

### Pola ack

Setiap event client→server pakai callback ack (bukan promise/event
terpisah): server SELALU memanggil balik dengan salah satu dari dua bentuk
berikut, tidak pernah diam saja.

```ts
type Ack<T> = (
  response: ({ ok: true } & T) | { ok: false; error: string }
) => void;
```

Contoh generik pemakaian:

```ts
socket.emit("room:create", { nickname: "Alice" }, (res) => {
  if (!res.ok) {
    console.error(res.error);
    return;
  }
  console.log(res.code, res.playerId, res.view);
});
```

### Tabel event: client → server

| Event | Payload | Ack sukses | Keterangan |
|---|---|---|---|
| `room:create` | `{ nickname: string, mode?: "casual" \| "standard" }` | `{ code, playerId, view: LobbyView }` | Buat room baru, pemanggil jadi host. `mode` default `"casual"`. `"standard"` ditolak kalau chain belum dikonfigurasi di server (lihat §4 "Chain Reader" dan "Mode room & Loadout" di bawah). |
| `room:join` | `{ code: string, nickname: string }` | `{ code, playerId, view: LobbyView }` | Gagal kalau room tidak ada, sudah `playing`/`finished`, atau penuh (maks 8). |
| `room:leave` | `{}` | `{}` | Kalau match sedang `playing`, match otomatis di-abort (lihat `match:ended`). |
| `draft:start` | `{}` | `{ view: LobbyView }` | Hanya host, hanya dari phase `lobby`, minimal 2 pemain. |
| `draft:submit` | `{ numbers: number[] }` | `{ view: LobbyView }` | `numbers` = board 5x5 (25 angka 1-25, row-major, tanpa duplikat). Room pindah ke `playing` begitu SEMUA pemain submit. |
| `match:call` | `{ number: number }` | `{ view: MatchView }` | Hanya valid kalau giliran pemanggil (`match.currentTurnPlayerId`), angka 1-25 belum pernah dipanggil. |
| `wallet:nonce` | `{}` | `{ nonce: string, message: string }` | Minta nonce baru untuk di-sign (lihat "Wallet link" di bawah). Boleh dipanggil sebelum atau sesudah join room. |
| `wallet:link` | `{ address: string, signature: string }` | `{ address: string }` | Verifikasi signature vs nonce terakhir yang diminta socket ini, lalu tautkan wallet (lihat "Wallet link" di bawah). |
| `loadout:set` | `{ skillIds: number[] }` | `{ view: LobbyView }` | Set loadout (0-2 skill id unik) — hanya room `mode: "standard"`, fase `lobby`/`draft`, wajib sudah `wallet:link` (lihat "Mode room & Loadout" di bawah). |

### Tabel event: server → client

| Event | Payload | Kapan dikirim |
|---|---|---|
| `room:state` | `LobbyView` | Broadcast ke semua socket di room setiap kali state lobby/draft berubah (join, start draft, submit board, wallet:link, loadout:set). |
| `match:state` | `MatchView` | Broadcast **per-viewer** (lihat di bawah) setiap kali ada `match:call` sukses, dan sekali saat room baru pindah ke `playing`. |
| `match:ended` | `{ winnerId: string \| null, reason?: string }` | Match selesai — baik karena menang (`winnerId` terisi) maupun aborted karena pemain keluar/disconnect (`winnerId: null`, `reason: "player_left" \| "player_disconnected"`). |
| `quest:completed` | `{ questId: string, title: string }` | Dikirim ke **socket milik pemain itu saja** (bukan broadcast room) setiap kali quest pemain itu baru saja selesai. |

### `LobbyView`

```ts
interface LobbyView {
  code: string;
  phase: "lobby" | "draft" | "playing" | "finished";
  hostId: string;
  mode: "casual" | "standard";
  players: {
    playerId: string;
    nickname: string;
    connected: boolean;
    hasSubmittedBoard: boolean;
    wallet?: string;          // address ter-link, lowercase — lihat "Wallet link" di bawah
    loadout?: number[];       // skill id terverifikasi on-chain — PUBLIC, lihat "Mode room & Loadout" di bawah
  }[];
}
```

`wallet`/`loadout` sengaja publik (semua pemain di room lihat pick lawan) —
yang tetap rahasia hanya isi board (`MatchView.board`, lihat di bawah).

### Redaksi board (penting)

`MatchView.board` **HANYA berisi board milik viewer sendiri**. Board lawan
tidak pernah muncul di payload manapun — ini alasan `match:state` di-emit
per-socket, bukan sekali per room. Jangan asumsikan `players[].board` ada;
field itu memang tidak dikirim.

```ts
interface MatchView {
  code: string;
  status: "in_progress" | "finished";
  calledNumbers: number[];
  currentTurnPlayerId?: string;
  winnerId?: string;
  board?: number[];        // board VIEWER sendiri saja
  players: {
    playerId: string;
    nickname: string;
    connected: boolean;
    lineCount: number;      // jumlah garis selesai lawan, TANPA bocorkan board-nya
  }[];
}
```

### Flow lengkap: create → join → draft → main → selesai

```ts
// 1) Host membuat room
socket.emit("room:create", { nickname: "Host" }, (res) => {
  if (!res.ok) return;
  const { code, playerId } = res;

  // 2) Pemain lain join pakai code (socket masing-masing)
  //    guestSocket.emit("room:join", { code, nickname: "Guest" }, ...)

  // 3) Host mulai draft (minimal 2 pemain sudah join)
  socket.emit("draft:start", {}, (res) => { /* ... */ });

  // 4) Tiap pemain submit board sendiri (5x5, 1-25, unik)
  socket.emit("draft:submit", { numbers: myBoard }, (res) => {
    // begitu SEMUA pemain submit, room pindah ke "playing" dan
    // match:state pertama otomatis di-broadcast (calledNumbers masih [])
  });

  // 5) Dengarkan giliran & state match
  socket.on("match:state", (view) => {
    const myTurn = view.currentTurnPlayerId === playerId;
    // render board sendiri (view.board), called numbers, giliran siapa
  });

  // 6) Saat giliran sendiri, panggil angka
  socket.emit("match:call", { number: 7 }, (res) => { /* ... */ });

  // 7) Match selesai
  socket.on("match:ended", ({ winnerId, reason }) => { /* ... */ });

  // Quest (opsional, per pemain)
  socket.on("quest:completed", ({ questId, title }) => { /* toast, dll */ });
});
```

### Wallet link (nonce → sign → link)

Guest play tetap jalan tanpa wallet sama sekali (CLAUDE.md). Wallet hanya
perlu di-link kalau pemain mau pakai loadout skill NFT di room `mode:
"standard"`. Trust boundary: server TIDAK PERNAH percaya `address` yang
diklaim client begitu saja — harus dibuktikan lewat signature atas nonce
yang server sendiri yang generate, sekali pakai.

1. **`wallet:nonce`** — client minta nonce. Server generate
   `nonce` (`crypto.randomUUID()`), simpan di socket (expiry ~5 menit),
   balas `{ nonce, message }` di mana:

   ```
   message = `TheBingoFi wallet link\nnonce: ${nonce}`
   ```

2. Client **sign `message`** dengan wallet (mis. viem
   `account.signMessage({ message })`, atau `wagmi`'s `useSignMessage` di
   FE) → dapat `signature`.

3. **`wallet:link { address, signature }`** — server verifikasi via viem
   `verifyMessage({ address, message, signature })` terhadap `message` dari
   nonce TERAKHIR yang diminta socket ini. Sukses →
   - `address` disimpan lowercase di player state (socket, dan di
     `RoomPlayer` kalau socket sedang dalam room),
   - nonce langsung dihapus (**sekali pakai** — replay dengan
     nonce/signature yang sama akan ditolak di percobaan berikutnya),
   - ack `{ address }` (lowercase),
   - kalau socket sedang dalam room, `room:state` (LobbyView, dengan
     `players[].wallet` terisi) di-broadcast ulang ke seluruh room.

   Gagal (signature tidak cocok, address lain, nonce belum diminta, atau
   nonce sudah expired/dipakai) → ack error, nonce TIDAK dihapus kalau
   sekadar gagal verifikasi (boleh retry selama belum expired) — hanya
   dihapus saat sukses atau saat expired.

`wallet:link` boleh dipanggil kapan saja — sebelum `room:create`/`room:join`
(wallet ikut terpasang begitu room dibuat/di-join), atau setelah sudah
dalam room (langsung update `RoomPlayer` yang sedang aktif + broadcast).

```ts
// FE-side sketch (viem)
socket.emit("wallet:nonce", {}, async (res) => {
  if (!res.ok) return;
  const signature = await walletClient.signMessage({ account, message: res.message });
  socket.emit("wallet:link", { address: account.address, signature }, (linkRes) => {
    if (!linkRes.ok) return console.error(linkRes.error);
    console.log("linked:", linkRes.address);
  });
});
```

### Mode room & Loadout

- `room:create({ nickname, mode })` — `mode` default `"casual"` (tanpa
  skill, seperti sekarang). `mode: "standard"` mengaktifkan `loadout:set`,
  tapi ditolak (`ok: false`) kalau server tidak punya chain terkonfigurasi
  (lihat §4 "Chain Reader" — perlu `REGISTRY_ADDRESS`+`COLLECTION_ADDRESS`
  atau `contracts/deployments/91342.json`).
- **`loadout:set { skillIds }`** — `skillIds` = 0-2 integer unik ≥ 1.
  Syarat: room harus `mode: "standard"`, fase `lobby` atau `draft` (loadout
  **dibekukan** begitu room pindah ke `playing` — set setelah itu ditolak),
  dan socket harus sudah `wallet:link`. Server memanggil
  `chain/reader.ts`'s `verifyLoadout(walletAddress, skillIds)` (kepemilikan
  + `active` + `maxPerLoadout` on-chain) — kalau valid, loadout tersimpan di
  `RoomPlayer` dan `room:state` di-broadcast; kalau tidak, ack error dengan
  `reason` dari `verifyLoadout` apa adanya (mis. "Skill 3 is not owned by
  this address").
- Pemain yang TIDAK set loadout tetap boleh `draft:submit`/main seperti
  biasa — free player tetap kompetitif (CLAUDE.md), main "polos" tanpa
  skill.
- **CATATAN implementasi**: langkah ini baru sampai "loadout terverifikasi
  on-chain tersimpan di state match" (`LobbyView.players[].loadout`).
  Eksekusi efek skill sungguhan saat match berjalan (Wild Daub, Double
  Call, Ghost Call, Cell Swap, Nullify) BELUM ada — itu bagian engine skill
  system, CLAUDE.md langkah 5, menyusul.

```ts
// Flow standard room ringkas (asumsi sudah wallet:link)
socket.emit("room:create", { nickname: "Host", mode: "standard" }, (res) => {
  if (!res.ok) return;
  const { code, playerId } = res;

  socket.emit("loadout:set", { skillIds: [1, 4] }, (res) => {
    if (!res.ok) return console.error(res.error); // mis. skill tidak dimiliki
    // res.view.players[].loadout sekarang publik untuk semua di room
  });

  // draft:start / draft:submit / match:call seperti biasa — pemain lain
  // boleh join tanpa loadout dan tetap main.
});
```

---

## 2. HTTP JSON API

Semua response berbentuk amplop JSON seragam:

```json
{ "ok": true, "data": ... }
{ "ok": false, "error": "pesan error" }
```

- `Access-Control-Allow-Origin: *` selalu ada di setiap response (termasuk
  error), plus preflight `OPTIONS` di-handle untuk semua path.
- Payload jelek → `400`. Path tak dikenal → `404`. Server tidak pernah
  crash karena request buruk.

### `GET /health`

```bash
curl http://localhost:3001/health
```

```json
{ "ok": true, "data": { "status": "ok" } }
```

### `GET /daily/today?date=YYYY-MM-DD`

`date` opsional, default hari ini (UTC). **Tidak pernah** mengembalikan urutan
panggilan angka hari itu (anti-cheat) — hanya nomor tantangan & tanggalnya.

```bash
curl "http://localhost:3001/daily/today?date=2026-08-01"
```

```json
{ "ok": true, "data": { "number": 1, "date": "2026-08-01" } }
```

### `POST /daily/play`

Body:

```json
{ "nickname": "Alice", "board": [1,2,3,...25 angka unik 1-25...], "date": "2026-08-01" }
```

`date` opsional (default hari ini). Board disimulasikan lawan urutan
panggilan deterministik hari itu, berhenti begitu 5 garis selesai. Skor juga
otomatis disubmit ke leaderboard harian tanggal tsb.

```bash
curl -X POST http://localhost:3001/daily/play \
  -H "Content-Type: application/json" \
  -d '{"nickname":"Alice","board":[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25]}'
```

```json
{
  "ok": true,
  "data": {
    "number": 1,
    "callsToBingo": 18,
    "linesPerCall": [0,0,0,...],
    "score": 800,
    "markedAtBingo": [true,false,...25 bool...],
    "shareCard": "TheBingoFi #1 — 5 garis, call ke-18\n🟩🟩⬜⬜🟩\n...",
    "shareCardEn": "TheBingoFi #1 — 5 lines in 18 calls\n🟩🟩⬜⬜🟩\n..."
  }
}
```

### `GET /daily/leaderboard?date=YYYY-MM-DD`

Top 50 skor tanggal tsb, urut `score` desc. Satu nickname hanya muncul sekali
(skor terbaiknya saja).

```bash
curl "http://localhost:3001/daily/leaderboard?date=2026-08-01"
```

```json
{ "ok": true, "data": [ { "nickname": "Alice", "score": 800, "callsToBingo": 18 } ] }
```

### `GET /quests`

Katalog quest aktif (`QuestDef[]`, lihat `server/src/quest/quest.ts`).

```bash
curl http://localhost:3001/quests
```

```json
{ "ok": true, "data": [ { "id": "daily_win_1_match", "title": "Menang 1x", "eventType": "match_won", "target": 1, "window": "daily", "reward": { "xp": 100, "seasonPoints": 20 } }, ... ] }
```

### `GET /quests/progress/:playerId`

Progress quest pemain tsb (`QuestProgress[]`) — store yang SAMA dipakai
realtime layer (satu sumber kebenaran, lihat `server/src/api/questStore.ts`),
jadi progress yang bertambah lewat match otomatis kelihatan di sini.

```bash
curl http://localhost:3001/quests/progress/<playerId>
```

```json
{ "ok": true, "data": [ { "questId": "daily_win_1_match", "playerId": "...", "periodKey": "2026-08-01", "count": 1, "completed": true } ] }
```

---

## 3. Environment Variables

| Var | Dipakai oleh | Default |
|---|---|---|
| `PORT` | `server/src/index.ts` | `3001` |
| `RPC_URL` | chain reader (`server/src/chain/config.ts`) | RPC publik GIWA Sepolia (`https://sepolia-rpc.giwa.io/`) |
| `REGISTRY_ADDRESS` | chain reader | zero address, fallback ke `contracts/deployments/91342.json` |
| `COLLECTION_ADDRESS` | chain reader | zero address, fallback ke `contracts/deployments/91342.json` |
| `MARKETPLACE_ADDRESS` | chain reader | zero address |

Server realtime + HTTP API TIDAK butuh env apa pun untuk jalan (guest play,
tanpa wallet, room `mode: "casual"`). Env chain hanya relevan begitu room
`mode: "standard"` dipakai (lihat bagian 4 & "Mode room & Loadout" di atas).
Karena kontrak SUDAH live di GIWA Sepolia
(`contracts/deployments/91342.json` — lihat CLAUDE.md), mode `"standard"`
jalan bahkan tanpa env var sama sekali di fresh checkout manapun; env var
hanya perlu diisi untuk override (mis. target chain lain / alamat baru).

---

## 4. Chain Reader (read-only, `server/src/chain/`)

Verifikasi ownership skill saat matchmaking (CLAUDE.md: "verifikasi
ownership skill saat matchmaking via read-only RPC/indexer"). Sekarang
ditempel ke `loadout:set` (lihat "Mode room & Loadout" di atas) lewat
dependency injection — realtime layer (`server/src/realtime/`) sendiri
TIDAK PERNAH membangun client viem; ia hanya menerima fungsi verifier lewat
`createRealtimeServer(httpServer, { verifyLoadout })`, supaya bisa ditest
tanpa chain sungguhan.

- `config.ts` — `giwaSepolia` (chain id `91342`), `loadChainConfig(env)`,
  `createChainClient(cfg)` (viem `PublicClient`).
- `abi.ts` — ABI minimal (`parseAbi`, human-readable) untuk
  `SkillRegistry.getSkill/nextSkillId/exists`,
  `SkillCollection.balanceOfBatch/uri`, `Marketplace.sales`.
- `reader.ts`:
  - `getCatalog(client, registryAddress)` → semua `SkillDef` terdaftar.
  - `getOwnedSkillIds(client, collectionAddress, owner, skillIds)` → subset
    yang `balance > 0`.
  - `verifyLoadout(client, cfg, owner, loadout)` → `{ valid, reason? }`:
    maks 2 skill, semua owned, semua `active` di registry, hormati
    `maxPerLoadout` per skill.
  - `verifyLoadoutPure(...)` — logic murni tanpa network, dipakai
    `verifyLoadout` di baliknya, gampang ditest.
- `defaultVerifier.ts` — `createDefaultLoadoutVerifier(env?, deploymentsPath?)`:
  resolusi produksi dari `LoadoutVerifier` yang di-wire `server/src/index.ts`
  ke `createRealtimeServer`. Urutan: (1) `REGISTRY_ADDRESS` +
  `COLLECTION_ADDRESS` dari env kalau ADA DUA-DUANYA, lalu (2) fallback baca
  `contracts/deployments/91342.json` dari repo root kalau file itu ada, lalu
  (3) `undefined` kalau tidak ada satu pun — pada titik itu `room:create`
  dengan `mode: "standard"` ditolak dengan pesan "Chain belum dikonfigurasi".
  Ini SATU-SATUNYA tempat di `server/` yang membangun client viem sungguhan;
  `realtime/` sendiri tidak pernah meng-importnya.

`client` di semua fungsi `reader.ts` adalah interface tipis
(`ChainReadClient`, cuma butuh `readContract`) — sebuah viem `PublicClient`
sungguhan (`createChainClient`) memenuhinya, begitu juga mock di unit test.
Demikian juga `realtime/server.ts`'s `LoadoutVerifier` — interface tipis
`(owner, skillIds) => Promise<{ valid, reason? }>` yang cocok secara
struktural dengan `verifyLoadout`, jadi bisa di-mock total di test tanpa
menyentuh chain sama sekali (lihat `realtime.test.ts`).

Test: `server/src/chain/reader.test.ts` (unit, `node --test` biasa) +
`server/src/chain/defaultVerifier.test.ts` (unit, resolusi env/file tanpa
RPC sungguhan) + `server/src/chain/chain.integration.test.ts` (opsional,
spawn anvil + forge beneran — jalankan lewat `pnpm test:chain`, di-skip
kalau `RUN_CHAIN_TESTS` bukan `1`).

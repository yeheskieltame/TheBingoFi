# contracts/ — TheBingoFi

Kontrak Solidity (Foundry) untuk **ownership & katalog** Skill/Skin NFT
TheBingoFi. Sesuai prinsip arsitektur di root `CLAUDE.md`: **on-chain = ownership
& katalog; off-chain = seluruh gameplay**. Tidak ada mekanik taruhan/pot/stake
apa pun di sini — hanya primary sale NFT.

## Peta Arsitektur & Interaksi

Siapa boleh manggil apa, dan ke mana alurnya:

```mermaid
flowchart TB
    Platform(["Platform admin<br/>(CREATOR_ROLE)"])
    Buyer(["Pembeli<br/>(siapa saja, wallet)"])
    Treasury(["Treasury<br/>(penampung revenue)"])

    subgraph OnChain["GIWA L2 (on-chain)"]
        Factory["SkillFactory<br/><i>entry point rilis skill</i>"]
        Registry["SkillRegistry<br/><i>katalog SkillDef</i>"]
        Market["Marketplace<br/><i>primary sale</i>"]
        Collection["SkillCollection<br/><i>ERC-1155 + royalti 5%</i>"]
    end

    subgraph OffChain["Off-chain (read-only ke chain)"]
        Server["Game Server"]
        FE["Web FE (wagmi/viem)"]
    end

    Platform -- "createSkill(def, maxSupply, price)" --> Factory
    Factory -- "register(def)<br/>[REGISTRAR_ROLE]" --> Registry
    Factory -- "createSale(id, price, supply)<br/>[LISTER_ROLE]" --> Market
    Buyer -- "buy(skillId, amount)<br/>+ ETH = price × amount" --> Market
    Market -- "mint(buyer, id, amount)<br/>[MINTER_ROLE]" --> Collection
    Market -- "withdraw()" --> Treasury

    Server -. "getSkill / balanceOfBatch<br/>(verifikasi loadout)" .-> Registry
    Server -.-> Collection
    FE -. "sales / uri / royaltyInfo" .-> Market
    FE -.-> Collection
```

Garis putus-putus = **read-only** (tidak pernah ada tx dari server/FE saat gameplay).
Setiap panah penuh dijaga role — tidak ada jalur lain: satu-satunya cara token
tercetak adalah pembelian lewat Marketplace, dan satu-satunya cara skill masuk
katalog adalah `createSkill` di Factory.

### Alur rilis skill baru (platform, 1 transaksi)

```mermaid
sequenceDiagram
    actor P as Platform (CREATOR_ROLE)
    participant F as SkillFactory
    participant R as SkillRegistry
    participant M as Marketplace

    P->>F: createSkill(def, maxSupply, price)
    F->>R: register(def) [REGISTRAR_ROLE]
    R->>R: skillId = nextSkillId++<br/>simpan SkillDef
    R-->>F: skillId
    R-->>R: emit SkillRegistered
    F->>M: createSale(skillId, price, maxSupply) [LISTER_ROLE]
    M->>M: sales[skillId] = Sale(aktif)
    M-->>M: emit SaleCreated
    F-->>F: emit SkillCreated
    F-->>P: skillId
    Note over R,M: Skill terdaftar DAN sale terbuka<br/>dalam satu tx — tanpa deploy kontrak baru
```

### Alur pembelian (user)

```mermaid
sequenceDiagram
    actor B as Pembeli
    participant M as Marketplace
    participant C as SkillCollection
    participant I as Indexer / Game Server

    B->>M: sales(skillId) — baca price (call, gratis)
    B->>M: buy(skillId, amount) + msg.value = price × amount
    M->>M: cek: sale ada? aktif? stok cukup?<br/>bayaran pas? (revert kalau tidak)
    M->>M: minted += amount (efek dulu — CEI)
    M->>C: mint(buyer, skillId, amount) [MINTER_ROLE]
    C-->>I: emit TransferSingle (mint)
    M-->>I: emit Purchased(skillId, buyer, amount, paid)
    Note over I: server refresh entitlement wallet →<br/>skill langsung bisa dipakai di loadout
    Note over M: ETH tertahan di kontrak sampai<br/>withdraw() → treasury (siapa pun boleh trigger)
```

## Ringkasan 4 Kontrak

| Kontrak | Peran |
|---|---|
| **SkillRegistry** | Katalog `SkillDef` (skillId, effectType, charges, cooldown, maxPerLoadout, rarity, active, metadataURI). `effectType` (bytes32, mis. `"WILD_DAUB"`) hanyalah identifier — **tidak dieksekusi on-chain**, di-mapping ke logic di game server. Hanya `REGISTRAR_ROLE` (dipegang SkillFactory) yang boleh `register()`. |
| **SkillFactory** | Entry point tunggal platform (`CREATOR_ROLE`) untuk merilis skill baru: `createSkill(SkillDef, maxSupply, price)` sekali panggil mendaftarkan ke Registry **dan** langsung membuka sale di Marketplace. Tidak ada deploy kontrak baru per skill. |
| **SkillCollection** | Satu ERC-1155 untuk seluruh Skill & Skin. `tokenId == skillId` dari SkillRegistry. Mint hanya lewat `MINTER_ROLE` (dipegang Marketplace). Mengimplementasikan **EIP-2981** royalti default 5% (500 basis points). |
| **Marketplace** | Primary sale — `buy(skillId, amount)` payable, mint langsung ke pembeli, checks-effects-interactions. Revenue mengalir ke `treasury` platform via `withdraw()`. |

Wiring role (dari `script/Deploy.s.sol`):
- `SkillFactory` → `REGISTRAR_ROLE` di SkillRegistry & `LISTER_ROLE` di Marketplace.
- `Marketplace` → `MINTER_ROLE` di SkillCollection.

## Fungsi yang Dipanggil Frontend (wagmi/viem)

- **Beli skill/skin**: `Marketplace.buy(skillId, amount)` — `payable`,
  `msg.value` HARUS sama persis dengan `price * amount`. Ambil `price` dari
  `Marketplace.sales(skillId)` (struct `Sale { price, maxSupply, minted, active }`)
  sebelum submit tx.
- **Cek kepemilikan**: `SkillCollection.balanceOf(owner, skillId)` — dipakai
  server saat matchmaking untuk verifikasi loadout, dan FE untuk tampilkan
  inventory.
- **Metadata token**: `SkillCollection.uri(skillId)` (ERC-1155 standard, base
  URI dengan placeholder `{id}`).
- **Katalog skill**: `SkillRegistry.getSkill(skillId)` — ambil `SkillDef`
  lengkap untuk render kartu skill di FE (nama/efek di-resolve dari
  `metadataURI`, aturan main dari `charges`/`cooldown`/`maxPerLoadout`).
- **Royalti (marketplace sekunder pihak ketiga)**:
  `SkillCollection.royaltyInfo(tokenId, salePrice)` (EIP-2981) → mengembalikan
  `(receiver, 5% dari salePrice)`.

## Events untuk Indexer / Server

| Event | Kontrak | Kegunaan |
|---|---|---|
| `SkillCreated(skillId, effectType, maxSupply, price)` | SkillFactory | Skill baru dirilis — server sync katalog & mapping `effectType` ke logic engine. |
| `SkillRegistered(skillId, effectType)` | SkillRegistry | Redundan dengan `SkillCreated` tapi berguna kalau ada jalur registrasi lain. |
| `SaleCreated(skillId, price, maxSupply)` / `SaleActiveSet(skillId, active)` | Marketplace | Status sale untuk katalog toko FE. |
| `Purchased(skillId, buyer, amount, paid)` | Marketplace | Trigger utama indexer — user beli skill, server refresh entitlement wallet tsb. |
| `TransferSingle(operator, from, to, id, value)` / `TransferBatch(...)` | SkillCollection (ERC-1155 standard) | Transfer/mint/burn token — dasar indexer inventory & ownership real-time (termasuk transfer di marketplace sekunder). |

## Deploy ke GIWA Sepolia

1. Copy env: dari root repo, isi `.env` berdasar `.env.example` (`PRIVATE_KEY`,
   `TREASURY_ADDRESS` opsional — default ke address deployer, `COLLECTION_URI`
   opsional).
2. Dari folder `contracts/`:

   ```bash
   forge script script/Deploy.s.sol --rpc-url giwa_sepolia --broadcast \
     --verify --verifier blockscout --verifier-url https://sepolia-explorer.giwa.io/api
   ```

   (`giwa_sepolia` sudah didefinisikan di `foundry.toml` → `https://sepolia-rpc.giwa.io/`,
   rate-limited, jangan untuk production traffic tinggi.)

   **Verifikasi**: GIWA Sepolia (chain 91342) belum terdaftar di Etherscan API v2
   (cek `https://api.etherscan.io/v2/chainlist`), explorer-nya adalah **Blockscout**
   — jadi verify lewat Blockscout API seperti flag di atas, tanpa API key. Kalau
   deploy sudah terlanjur tanpa `--verify`, susulkan per kontrak dengan
   `forge verify-contract <address> <Contract> --verifier blockscout --verifier-url
   https://sepolia-explorer.giwa.io/api --chain 91342`.

3. Setelah broadcast sukses, script otomatis menulis
   `deployments/91342.json` (chain ID GIWA Sepolia) berisi address ke-4
   kontrak — lihat `deployments/README.md`.
4. Verifikasi kontrak di explorer (opsional): `https://sepolia-explorer.giwa.io`.

Jangan pernah commit private key. `.env` sudah ada di `.gitignore` root.

## Regenerate ABI untuk FE/Server

```bash
cd contracts
./export-abi.sh
```

Menjalankan `forge inspect <Contract> abi --json` untuk keempat kontrak dan
menulis **ABI array murni** (bukan artifact Foundry penuh) ke
`abi/SkillRegistry.json`, `abi/SkillFactory.json`, `abi/SkillCollection.json`,
`abi/Marketplace.json`. File-file ini yang di-import langsung oleh `web/`
(wagmi/viem `getContract({ abi, address })`) dan `server/`. Jalankan ulang
setiap kali signature fungsi/event di `src/` berubah.

## Lokasi Address Hasil Deploy

`deployments/<chainId>.json` — ditulis otomatis oleh `script/Deploy.s.sol`
setiap `--broadcast`. FE dan server baca address kontrak dari file ini
(gabungkan dengan ABI dari `abi/`), jangan hardcode address di kode aplikasi.
Detail format ada di `deployments/README.md`.

## Development

```bash
forge build   # compile
forge test    # unit test (34 test, wajib hijau semua sebelum ubah src/)
forge fmt     # format
```

Test wajib mencakup: win-independent unit test tiap kontrak (Registry role
guard, Factory wiring, Collection mint/royalti, Marketplace buy/sale
lifecycle). Jangan ubah logic di `src/` tanpa memastikan `forge test` tetap
hijau.

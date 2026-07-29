# TheBingoFi

Bingo strategis multiplayer, free-to-play, non-gambling. Gameplay 100% web2; monetisasi lewat Skill & Skin NFT di GIWA (OP Stack L2). Konsep lengkap: [CONCEPT.md](CONCEPT.md).

## Struktur

```
contracts/   Solidity (Foundry) — SkillRegistry, SkillFactory, SkillCollection (ERC-1155), Marketplace
server/      Game backend (Node.js + TS) — engine pure functions, daily challenge, quest engine
web/          Web client (Next.js + TS + Tailwind)
```

## Setup

```bash
pnpm install                 # be + fe (pnpm workspaces)
cd contracts && forge build  # butuh Foundry
```

## Test

```bash
pnpm test:contracts   # forge test
pnpm test:server          # node --test (game engine)
```

## API untuk FE

- `server/API.md` — kontrak lengkap: event Socket.IO (typed, import dari `@thebingofi/server/protocol`) + HTTP API (daily challenge, leaderboard, quests).
- `contracts/abi/*.json` + `contracts/deployments/<chainId>.json` — ABI & address untuk wagmi/viem (lihat `contracts/README.md`).

## Deploy (GIWA Sepolia)

Salin `.env.example` → `.env`, isi `PRIVATE_KEY` (jangan pernah commit), lalu:

```bash
cd contracts
forge script script/Deploy.s.sol --rpc-url giwa_sepolia --broadcast
```

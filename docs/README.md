# TheBingoFi — docs

Whitepaper / documentation site for TheBingoFi, built with [Mintlify](https://mintlify.com). Content lives in the `.mdx` files in this folder; site config is `docs.json`.

This folder is self-contained: it does not import or depend on `contracts/`, `server/`, or `web/` — all facts (contract addresses, prices, test counts, API shapes) are written directly into the `.mdx` pages, sourced from `CONCEPT.md`, `README.md`, `contracts/README.md`, `server/API.md`, and `BRIEF.md` at the repo root.

## Preview locally

Mintlify's CLI requires an LTS Node version (Node 25 is not supported as of this writing — use Node 22 or 20, e.g. via `nvm use 22`).

```bash
cd docs
npx mint@latest dev
```

This starts a local preview (default `http://localhost:3000` — pass `--port <n>` if that port is taken). It watches the `.mdx` files and `docs.json` for changes.

Useful checks before publishing changes:

```bash
npx mint@latest broken-links   # find broken internal/external links
npx mint@latest validate       # strict schema/build validation
```

## Deploy

The simplest path is connecting this repo to Mintlify's hosting:

1. In the [Mintlify dashboard](https://dashboard.mintlify.com), create/select the project and point it at this repository with **`docs/` as the root directory** (this repo is a monorepo — `contracts/`, `server/`, `web/` live alongside `docs/`, so the docs root must be set explicitly).
2. Every push to the connected branch redeploys automatically.

Alternatively, deploy directly from the CLI (if available for the account/plan in use):

```bash
cd docs
npx mint@latest deploy
```

## Structure

```
docs/
  docs.json          # site config: nav, theme, colors, logo, navbar links
  introduction.mdx
  problem.mdx
  solution.mdx
  gameplay.mdx
  skill-system.mdx
  economy.mdx
  social-growth.mdx
  architecture.mdx
  smart-contracts.mdx
  roadmap-status.mdx
  faq.mdx
  logo/
    logo.svg          # copied from web/public/logo.svg
    logo.png          # copied from assets/logo.png
  favicon.ico          # copied from web/src/app/favicon.ico
```

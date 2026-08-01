import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @thebingofi/server's package.json "exports" point straight at raw .ts
  // sources (see server/package.json "./protocol" and "./engine") - this
  // tells Next's bundler to compile them instead of treating the package as
  // pre-built JS.
  transpilePackages: ["@thebingofi/server"],
  images: {
    // Skill metadata's `image` (GET /metadata/:id.json, server's
    // METADATA_ASSET_BASE_URL) is an ABSOLUTE URL at this app's own deployed
    // origin (thebingofi.vercel.app/assets/skills/*.png) - next/image treats
    // any absolute URL as "remote" regardless of whether it happens to match
    // the current deployment, so it still needs an explicit allowlist entry
    // even though the asset ships in this repo's public/assets/skills.
    // Used by lib/boardSkins.ts's skin artwork on MatchBoard/DraftBoard.
    remotePatterns: [new URL("https://thebingofi.vercel.app/assets/skills/**")],
  },
};

export default nextConfig;

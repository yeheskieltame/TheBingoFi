import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @thebingofi/server's package.json "exports" point straight at raw .ts
  // sources (see server/package.json "./protocol" and "./engine") - this
  // tells Next's bundler to compile them instead of treating the package as
  // pre-built JS.
  transpilePackages: ["@thebingofi/server"],
};

export default nextConfig;

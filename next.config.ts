import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["better-sqlite3"],
  // Migrations are read from disk at startup; make sure they ship in the standalone bundle.
  outputFileTracingIncludes: {
    "/*": ["./drizzle/**/*"],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "6mb",
    },
  },
  poweredByHeader: false,
};

export default withNextIntl(nextConfig);

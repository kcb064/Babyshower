import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const __dirname = dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory: __dirname });

const config = [
  {
    ignores: [".next/**", "node_modules/**", "drizzle/**", "test-results/**", "playwright-report/**", "next-env.d.ts"],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // Item images come from arbitrary store domains and local uploads; next/image would need
      // an open remotePatterns list, so plain <img> is the deliberate choice here.
      "@next/next/no-img-element": "off",
    },
  },
];

export default config;

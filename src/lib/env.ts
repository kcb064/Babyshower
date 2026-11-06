import path from "node:path";
import { cookieSecretFromEnv } from "./auth-constants";

const isProd = process.env.NODE_ENV === "production";

const DEV_PASSCODE = "dev";

export interface ServerEnv {
  editorPasscode: string;
  cookieSecret: string;
  ntfyTopic: string | undefined;
  publicUrl: string | undefined;
  databasePath: string;
  dataDir: string;
  uploadsDir: string;
  secureCookies: boolean;
}

/** Throw if a required production variable is missing. Called once at server startup. */
export function assertProductionEnv(env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV !== "production") return;
  const missing = ["EDITOR_PASSCODE", "COOKIE_SECRET"].filter((k) => !env[k]?.trim());
  if (missing.length) {
    throw new Error(`Missing required environment variable(s): ${missing.join(", ")}. See .env.example.`);
  }
}

export function serverEnv(): ServerEnv {
  const dataDir = path.resolve(process.env.DATA_DIR?.trim() || "./data");
  const publicUrl = process.env.PUBLIC_URL?.trim().replace(/\/+$/, "") || undefined;
  return {
    editorPasscode: process.env.EDITOR_PASSCODE?.trim() || (isProd ? "" : DEV_PASSCODE),
    cookieSecret: cookieSecretFromEnv(process.env),
    ntfyTopic: process.env.NTFY_TOPIC?.trim() || undefined,
    publicUrl,
    databasePath: path.resolve(process.env.DATABASE_PATH?.trim() || "./data/registry.db"),
    dataDir,
    uploadsDir: path.join(dataDir, "uploads"),
    // Behind Cloudflare the browser talks HTTPS; allow plain-http PUBLIC_URL for local runs and tests.
    secureCookies: isProd && !(publicUrl?.startsWith("http://") ?? false),
  };
}

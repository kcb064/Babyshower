// Starts the built standalone server against a throwaway SQLite file for Playwright.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const standalone = path.join(root, ".next", "standalone");
if (!fs.existsSync(path.join(standalone, "server.js"))) {
  console.error("No standalone build found; run `pnpm build` first.");
  process.exit(1);
}
// Standalone output does not include static assets or public/; copy them in like the Dockerfile does.
fs.cpSync(path.join(root, ".next", "static"), path.join(standalone, ".next", "static"), { recursive: true });
if (fs.existsSync(path.join(root, "public"))) {
  fs.cpSync(path.join(root, "public"), path.join(standalone, "public"), { recursive: true });
}

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "babyshower-e2e-"));
const port = process.env.E2E_PORT ?? "3100";
const child = spawn(process.execPath, [path.join(standalone, "server.js")], {
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_ENV: "production",
    PORT: port,
    HOSTNAME: "127.0.0.1",
    DATA_DIR: dataDir,
    DATABASE_PATH: path.join(dataDir, "registry.db"),
    EDITOR_PASSCODE: "test",
    COOKIE_SECRET: "e2e-cookie-secret-not-for-production",
    PUBLIC_URL: `http://localhost:${port}`,
    NTFY_TOPIC: "",
    // Auto-translate without network: the fake provider returns "[sv] text" / "[en] text".
    TRANSLATE_PROVIDER: "mymemory",
    TRANSLATE_FAKE: "1",
    ANTHROPIC_API_KEY: "",
  },
});

function cleanup() {
  fs.rmSync(dataDir, { recursive: true, force: true });
}
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    child.kill(sig);
  });
}
child.on("exit", (code) => {
  cleanup();
  process.exit(code ?? 0);
});

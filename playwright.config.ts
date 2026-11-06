import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  timeout: 60_000,
  use: {
    baseURL: `http://localhost:${port}`,
    trace: "off",
  },
  projects: [{ name: "mobile-chromium", use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } } }],
  webServer: {
    // Build once, then run the standalone server with a temp DATABASE_PATH and EDITOR_PASSCODE=test.
    command: process.env.E2E_SKIP_BUILD ? "node e2e/server.mjs" : "pnpm build && node e2e/server.mjs",
    url: `http://localhost:${port}/api/health`,
    timeout: 300_000,
    reuseExistingServer: false,
    stdout: "pipe",
    stderr: "pipe",
  },
});

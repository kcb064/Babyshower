import path from "node:path";
import { getDb } from "@/db";
import { serverEnv } from "./env";
import { BACKUP_KEEP, listBackups, runBackup } from "../../scripts/backup-lib.mjs";

export { BACKUP_KEEP, listBackups };

export function backupsDir(): string {
  return path.join(serverEnv().dataDir, "backups");
}

/** Back up the live database through the app's open connection. */
export async function backupNow(now: Date = new Date()) {
  return runBackup({ source: getDb().$client, backupsDir: backupsDir(), now });
}

const DAY_MS = 24 * 60 * 60 * 1000;
const FIRST_RUN_MS = 60 * 1000;
const globalForBackup = globalThis as unknown as { __backupTimerStarted?: boolean };

/** Daily backup inside the server process: once 60 s after boot, then every 24 h. Production only. */
export function startBackupSchedule(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.NODE_ENV !== "production" || globalForBackup.__backupTimerStarted) return false;
  globalForBackup.__backupTimerStarted = true;
  const run = () => {
    backupNow()
      .then((r) => console.log(`[backup] wrote ${r.name} (${r.count} kept)`))
      .catch((err: unknown) => console.error("[backup] failed:", err instanceof Error ? err.message : err));
  };
  setTimeout(run, FIRST_RUN_MS).unref();
  setInterval(run, DAY_MS).unref();
  return true;
}

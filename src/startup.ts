import { getDb } from "./db";
import { startBackupSchedule } from "./lib/backup";
import { assertProductionEnv } from "./lib/env";

/** Runs once when the Node server boots: fail fast on bad config, migrate and seed, schedule backups. */
export function startup() {
  try {
    assertProductionEnv();
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
  getDb();
  if (startBackupSchedule()) console.log("[backup] daily backup scheduled (first run in 60 s)");
}

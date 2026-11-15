import { getDb } from "./db";
import { startBackupSchedule } from "./lib/backup";
import { assertProductionEnv } from "./lib/env";
import { startReminderSchedule } from "./lib/reminder-schedule";

/** Runs once when the Node server boots: fail fast on bad config, migrate and seed, schedule backups and reminders. */
export function startup() {
  try {
    assertProductionEnv();
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
  getDb();
  if (startBackupSchedule()) console.log("[backup] daily backup scheduled (first run in 60 s)");
  const reminders = startReminderSchedule();
  if (reminders === "started") console.log("[reminders] email reminders scheduled (hourly check, sent 09–20 Swedish time)");
  if (reminders === "noPublicUrl") console.warn("[reminders] SMTP is set but PUBLIC_URL is not: reminders are off");
}

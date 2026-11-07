#!/usr/bin/env node
// Manual backup: `pnpm backup`, or in Docker `docker exec babyshower node scripts/backup.mjs`.
// Writes ${DATA_DIR}/backups/registry-YYYYMMDD-HHMM.db and keeps the newest 14.
import path from "node:path";
import { runBackup } from "./backup-lib.mjs";

const dataDir = path.resolve(process.env.DATA_DIR?.trim() || "./data");
const dbPath = path.resolve(process.env.DATABASE_PATH?.trim() || "./data/registry.db");

try {
  const res = await runBackup({ source: dbPath, backupsDir: path.join(dataDir, "backups") });
  console.log(`Backup written: ${res.file} (${res.count} kept${res.deleted.length ? `, removed ${res.deleted.join(", ")}` : ""})`);
} catch (err) {
  console.error("Backup failed:", err instanceof Error ? err.message : err);
  process.exit(1);
}

// SQLite backups with better-sqlite3's online .backup() API (no sqlite3 CLI needed).
// Shared by `pnpm backup` (scripts/backup.mjs) and the in-app daily timer / admin button.
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

export const BACKUP_KEEP = 14;
const NAME_RE = /^registry-\d{8}-\d{4}(?:-\d+)?\.db$/;

const pad = (n) => String(n).padStart(2, "0");

/** registry-YYYYMMDD-HHMM.db in UTC, so names sort chronologically. */
export function backupFileName(now = new Date()) {
  const d = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}`;
  const t = `${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}`;
  return `registry-${d}-${t}.db`;
}

export function isBackupFileName(name) {
  return NAME_RE.test(name);
}

/** Backup files in dir, newest first. */
export function listBackups(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter(isBackupFileName)
    .sort()
    .reverse();
}

/** Delete all but the newest `keep` backups. Returns the names deleted. */
export function pruneBackups(dir, keep = BACKUP_KEEP) {
  const all = listBackups(dir);
  const remove = all.slice(Math.max(0, keep));
  for (const name of remove) fs.rmSync(path.join(dir, name), { force: true });
  return remove;
}

/**
 * Write a consistent copy of the database to `${backupsDir}/registry-YYYYMMDD-HHMM.db` and keep
 * the newest `keep`. `source` is a database path or an open better-sqlite3 connection.
 */
export async function runBackup({ source, backupsDir, keep = BACKUP_KEEP, now = new Date() }) {
  fs.mkdirSync(backupsDir, { recursive: true });
  let name = backupFileName(now);
  // Two backups in the same minute (e.g. button pressed twice): add a counter, never overwrite.
  for (let i = 2; fs.existsSync(path.join(backupsDir, name)); i++) name = backupFileName(now).replace(/\.db$/, `-${i}.db`);
  const file = path.join(backupsDir, name);
  const tmp = `${file}.tmp`;
  const ownsConnection = typeof source === "string";
  const db = ownsConnection ? new Database(source, { readonly: true, fileMustExist: true }) : source;
  try {
    await db.backup(tmp);
    fs.renameSync(tmp, file);
  } catch (err) {
    fs.rmSync(tmp, { force: true });
    throw err;
  } finally {
    if (ownsConnection) db.close();
  }
  const deleted = pruneBackups(backupsDir, keep);
  return { file, name, count: listBackups(backupsDir).length, deleted };
}

import type BetterSqlite3 from "better-sqlite3";

export const BACKUP_KEEP: number;
export function backupFileName(now?: Date): string;
export function isBackupFileName(name: string): boolean;
export function listBackups(dir: string): string[];
export function pruneBackups(dir: string, keep?: number): string[];
export function runBackup(opts: {
  source: string | BetterSqlite3.Database;
  backupsDir: string;
  keep?: number;
  now?: Date;
}): Promise<{ file: string; name: string; count: number; deleted: string[] }>;

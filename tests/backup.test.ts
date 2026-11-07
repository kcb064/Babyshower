import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BACKUP_KEEP, backupFileName, isBackupFileName, listBackups, pruneBackups, runBackup } from "../scripts/backup-lib.mjs";

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "babyshower-backup-test-"));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("backup names", () => {
  it("formats registry-YYYYMMDD-HHMM.db in UTC", () => {
    expect(backupFileName(new Date("2026-12-06T09:05:00Z"))).toBe("registry-20261206-0905.db");
    expect(isBackupFileName("registry-20261206-0905.db")).toBe(true);
    expect(isBackupFileName("registry-20261206-0905-2.db")).toBe(true);
    expect(isBackupFileName("registry.db")).toBe(false);
    expect(isBackupFileName("notes.txt")).toBe(false);
  });
});

describe("pruneBackups", () => {
  it("keeps the newest 14 and deletes the oldest", () => {
    const names = Array.from({ length: 17 }, (_, i) => backupFileName(new Date(Date.UTC(2026, 10, 1 + i, 3, 0))));
    for (const n of names) fs.writeFileSync(path.join(dir, n), "x");
    fs.writeFileSync(path.join(dir, "unrelated.txt"), "keep me");
    const deleted = pruneBackups(dir);
    expect(BACKUP_KEEP).toBe(14);
    expect(deleted.sort()).toEqual(names.slice(0, 3));
    expect(listBackups(dir)).toEqual(names.slice(3).reverse());
    expect(fs.existsSync(path.join(dir, "unrelated.txt"))).toBe(true);
  });

  it("does nothing with fewer than 14", () => {
    fs.writeFileSync(path.join(dir, backupFileName(new Date("2026-11-01T00:00:00Z"))), "x");
    expect(pruneBackups(dir)).toEqual([]);
    expect(listBackups(dir)).toHaveLength(1);
  });
});

describe("runBackup", () => {
  it("writes a readable copy with .backup() and applies retention", async () => {
    const src = path.join(dir, "registry.db");
    const db = new Database(src);
    db.exec("CREATE TABLE t (v TEXT); INSERT INTO t VALUES ('hej');");
    const backups = path.join(dir, "backups");
    for (let i = 0; i < 14; i++) {
      fs.mkdirSync(backups, { recursive: true });
      fs.writeFileSync(path.join(backups, backupFileName(new Date(Date.UTC(2026, 9, 1 + i)))), "old");
    }
    const res = await runBackup({ source: db, backupsDir: backups, now: new Date("2026-12-06T10:30:00Z") });
    expect(res.name).toBe("registry-20261206-1030.db");
    expect(res.count).toBe(14);
    expect(res.deleted).toEqual([backupFileName(new Date(Date.UTC(2026, 9, 1)))]);
    const copy = new Database(res.file, { readonly: true });
    expect(copy.prepare("SELECT v FROM t").get()).toEqual({ v: "hej" });
    copy.close();

    // Same minute again: a second file, never an overwrite. Also works from a path.
    db.close();
    const again = await runBackup({ source: src, backupsDir: backups, now: new Date("2026-12-06T10:30:30Z") });
    expect(again.name).toBe("registry-20261206-1030-2.db");
    expect(fs.readdirSync(backups).some((n) => n.endsWith(".tmp"))).toBe(false);
  });
});

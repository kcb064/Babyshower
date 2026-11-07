import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema";
import { seed } from "./seed";
import { seedStarter } from "./starter";

export type DB = BetterSQLite3Database<typeof schema> & { $client: Database.Database };

const globalForDb = globalThis as unknown as { __registryDb?: { db: DB; path: string } };

function migrationsFolder(): string {
  const candidates = [path.join(process.cwd(), "drizzle"), path.join(__dirname, "../../drizzle")];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, "meta", "_journal.json"))) return c;
  }
  throw new Error(`Drizzle migrations folder not found (looked in ${candidates.join(", ")})`);
}

/**
 * Open (and on first use migrate + seed) the SQLite database. `starter` also inserts the hidden
 * starter list on first run; the app always does this, unit tests opt in so their fixtures stay small.
 */
export function openDb(filePath: string, opts: { starter?: boolean } = {}): DB {
  if (filePath !== ":memory:") fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const sqlite = new Database(filePath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: migrationsFolder() });
  seed(db);
  if (opts.starter) seedStarter(db);
  return db;
}

export function getDb(): DB {
  const filePath = path.resolve(process.env.DATABASE_PATH?.trim() || "./data/registry.db");
  const cached = globalForDb.__registryDb;
  if (cached && cached.path === filePath) return cached.db;
  const db = openDb(filePath, { starter: true });
  globalForDb.__registryDb = { db, path: filePath };
  return db;
}

export { schema };

import { count } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

type DB = BetterSQLite3Database<typeof schema>;

export const DEFAULT_CATEGORIES: { sv: string; en: string; icon: string }[] = [
  { sv: "Sova", en: "Sleep", icon: "moon" },
  { sv: "Mat", en: "Feeding", icon: "bottle" },
  { sv: "Bad", en: "Bath", icon: "drop" },
  { sv: "Kläder", en: "Clothing", icon: "shirt" },
  { sv: "Blöjor", en: "Diapering", icon: "leaf" },
  { sv: "Ute", en: "Out and about", icon: "stroller" },
  { sv: "Lek", en: "Play", icon: "star" },
  { sv: "Böcker", en: "Books", icon: "book" },
  { sv: "Hälsa", en: "Health", icon: "heart" },
];

/** Insert the single Registry row and default categories on first run. Idempotent. */
export function seed(db: DB) {
  db.transaction((tx) => {
    const existing = tx.select({ id: schema.registry.id }).from(schema.registry).get();
    if (!existing) {
      tx.insert(schema.registry)
        .values({
          id: 1,
          title: { sv: "Babyshower", en: "Baby shower" },
          welcome: {
            sv: "Välkommen! Här är några saker som skulle göra livet lite enklare för oss och den lilla. Reservera det du vill ge, så vet andra att det är taget.",
            en: "Welcome! Here are a few things that would make life a little easier for us and the little one. Reserve what you would like to give so others know it is taken.",
          },
          eventDate: "2026-12-06",
          eventTime: "14:00",
          theme: "botanist",
          revealed: false,
        })
        .run();
    }
    const [{ n } = { n: 0 }] = tx.select({ n: count() }).from(schema.category).all();
    if (n === 0) {
      tx.insert(schema.category)
        .values(DEFAULT_CATEGORIES.map((c, i) => ({ name: { sv: c.sv, en: c.en }, icon: c.icon, sortOrder: (i + 1) * 10 })))
        .run();
    }
  });
}

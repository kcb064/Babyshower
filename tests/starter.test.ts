import { describe, expect, it } from "vitest";
import { count, eq } from "drizzle-orm";
import { openDb } from "@/db";
import { listPublicItems, listStarterItems } from "@/db/queries";
import { item, registry } from "@/db/schema";
import { DEFAULT_CATEGORIES, seed } from "@/db/seed";
import { seedStarter, STARTER_ITEMS } from "@/db/starter";

describe("starter list data", () => {
  it("has 45–60 items with unique keys, both languages and sane values", () => {
    expect(STARTER_ITEMS.length).toBeGreaterThanOrEqual(45);
    expect(STARTER_ITEMS.length).toBeLessThanOrEqual(60);
    expect(new Set(STARTER_ITEMS.map((i) => i.key)).size).toBe(STARTER_ITEMS.length);
    const cats = new Set(DEFAULT_CATEGORIES.map((c) => c.sv));
    for (const it of STARTER_ITEMS) {
      expect(cats.has(it.category), it.key).toBe(true);
      expect(it.sv && it.en && it.noteSv && it.noteEn, it.key).toBeTruthy();
      expect(Number.isInteger(it.price) && it.price > 0 && it.price < 20000, it.key).toBe(true);
      expect(it.qty >= 1 && it.qty <= 12, it.key).toBe(true);
    }
    for (const c of cats)
      expect(
        STARTER_ITEMS.some((i) => i.category === c),
        c,
      ).toBe(true);
  });
});

describe("seedStarter", () => {
  it("inserts every suggestion hidden and seeded, in its category", () => {
    const db = openDb(":memory:", { starter: true });
    const rows = listStarterItems(db);
    expect(rows).toHaveLength(STARTER_ITEMS.length);
    expect(
      rows.every((r) => r.seeded && !r.visible && r.type === "physical" && r.storeUrl === null && r.categoryId !== null),
    ).toBe(true);
    expect(listPublicItems(db)).toHaveLength(0);
  });

  it("is idempotent across restarts and does not re-add deleted suggestions", () => {
    const db = openDb(":memory:", { starter: true });
    expect(seedStarter(db)).toBe(0);
    seed(db);
    expect(db.select({ n: count() }).from(item).get()?.n).toBe(STARTER_ITEMS.length);
    db.delete(item).where(eq(item.starterKey, STARTER_ITEMS[0]!.key)).run();
    expect(seedStarter(db)).toBe(0);
    expect(db.select({ n: count() }).from(item).get()?.n).toBe(STARTER_ITEMS.length - 1);
  });

  it("never duplicates a key even if the seeded flag is reset", () => {
    const db = openDb(":memory:", { starter: true });
    db.update(registry).set({ starterSeededAt: null }).run();
    expect(seedStarter(db)).toBe(0);
    expect(db.select({ n: count() }).from(item).get()?.n).toBe(STARTER_ITEMS.length);
  });

  it("making a suggestion visible shows it to guests", () => {
    const db = openDb(":memory:", { starter: true });
    const first = listStarterItems(db)[0]!;
    db.update(item).set({ visible: true }).where(eq(item.id, first.id)).run();
    expect(listPublicItems(db).map((i) => i.id)).toEqual([first.id]);
  });
});

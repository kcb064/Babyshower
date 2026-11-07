import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import type { Bilingual } from "@/lib/i18n";

const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`);

export const registry = sqliteTable("registry", {
  id: integer("id").primaryKey(),
  title: text("title", { mode: "json" }).$type<Bilingual>().notNull(),
  welcome: text("welcome", { mode: "json" }).$type<Bilingual>().notNull(),
  eventDate: text("event_date").notNull(), // YYYY-MM-DD
  eventTime: text("event_time"), // HH:MM
  location: text("location"),
  mapUrl: text("map_url"),
  hostContact: text("host_contact"),
  theme: text("theme").notNull().default("botanist"),
  revealed: integer("revealed", { mode: "boolean" }).notNull().default(false),
  revealedAt: integer("revealed_at", { mode: "timestamp_ms" }),
  revealedBy: text("revealed_by"),
  coverImage: text("cover_image"),
  swishNumber: text("swish_number"),
  /** Set once the starter list has been inserted, so a restart never re-adds deleted suggestions. */
  starterSeededAt: integer("starter_seeded_at", { mode: "timestamp_ms" }),
  /** Last one-time "peek" at the full list before reveal (does not change `revealed`). */
  lastPeekAt: integer("last_peek_at", { mode: "timestamp_ms" }),
  lastPeekBy: text("last_peek_by"),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }),
});

export const category = sqliteTable("category", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name", { mode: "json" }).$type<Bilingual>().notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  icon: text("icon"),
});

export const itemTypes = ["physical", "group", "fund"] as const;
export type ItemType = (typeof itemTypes)[number];
export const priorities = ["must", "nice"] as const;
export type Priority = (typeof priorities)[number];

export const linkStatuses = ["ok", "dead", "changed"] as const;
export type LinkStatus = (typeof linkStatuses)[number];

export const item = sqliteTable(
  "item",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    type: text("type", { enum: itemTypes }).notNull().default("physical"),
    name: text("name", { mode: "json" }).$type<Bilingual>().notNull(),
    description: text("description", { mode: "json" }).$type<Bilingual>(),
    imageUrl: text("image_url"),
    storeUrl: text("store_url"),
    price: integer("price"), // whole SEK
    qtyWanted: integer("qty_wanted").notNull().default(1),
    priority: text("priority", { enum: priorities }).notNull().default("nice"),
    categoryId: integer("category_id").references(() => category.id, { onDelete: "set null" }),
    notes: text("notes", { mode: "json" }).$type<Bilingual>(),
    usedOk: integer("used_ok", { mode: "boolean" }).notNull().default(false),
    goalAmount: integer("goal_amount"), // SEK, for group gifts and funds
    sortOrder: integer("sort_order").notNull().default(0),
    visible: integer("visible", { mode: "boolean" }).notNull().default(true),
    seeded: integer("seeded", { mode: "boolean" }).notNull().default(false),
    /** Stable key of a starter-list suggestion (src/db/starter.ts); null for editor-created items. */
    starterKey: text("starter_key"),
    /** Result of the last "check links" run; the editor's own price is never changed by it. */
    linkCheckedAt: integer("link_checked_at", { mode: "timestamp_ms" }),
    linkStatus: text("link_status", { enum: linkStatuses }),
    /** Whole SEK read from the store page at the last check, if it stated one. */
    scrapedPrice: integer("scraped_price"),
    createdAt: createdAt(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }),
  },
  (t) => [index("item_category_idx").on(t.categoryId), uniqueIndex("item_starter_key_idx").on(t.starterKey)],
);

export const claimStatuses = ["reserved", "purchased", "released"] as const;

export const claim = sqliteTable(
  "claim",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    itemId: integer("item_id")
      .notNull()
      .references(() => item.id, { onDelete: "cascade" }),
    /** Random id from the guest's signed cookie; lets "my claims" find claims from this guest. */
    guestKey: text("guest_key").notNull(),
    guestName: text("guest_name").notNull(),
    guestEmail: text("guest_email").notNull(),
    qty: integer("qty").notNull().default(1),
    status: text("status", { enum: claimStatuses }).notNull().default("reserved"),
    /** SEK for group-gift / fund contributions; null for a physical claim (incl. "buy the whole gift"). */
    amount: integer("amount"),
    message: text("message"),
    showName: integer("show_name", { mode: "boolean" }).notNull().default(false),
    address: text("address"),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }),
    releasedAt: integer("released_at", { mode: "timestamp_ms" }),
    /** When the guest pressed "I've sent it" for a Swish contribution. Only confirmed ones count. */
    confirmedAt: integer("confirmed_at", { mode: "timestamp_ms" }),
  },
  (t) => [index("claim_item_idx").on(t.itemId), index("claim_guest_idx").on(t.guestKey)],
);

export const thankYou = sqliteTable(
  "thank_you",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    claimId: integer("claim_id")
      .notNull()
      .references(() => claim.id, { onDelete: "cascade" }),
    sentAt: integer("sent_at", { mode: "timestamp_ms" }),
    note: text("note"),
  },
  // One thank-you per gift: ticking "Tackat" upserts, unticking deletes.
  (t) => [uniqueIndex("thank_you_claim_idx").on(t.claimId)],
);

export const editorLog = sqliteTable("editor_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  who: text("who").notNull(),
  what: text("what").notNull(),
  createdAt: createdAt(),
});

export type Registry = typeof registry.$inferSelect;
export type Category = typeof category.$inferSelect;
export type Item = typeof item.$inferSelect;
export type Claim = typeof claim.$inferSelect;
export type EditorLog = typeof editorLog.$inferSelect;
export type ThankYou = typeof thankYou.$inferSelect;

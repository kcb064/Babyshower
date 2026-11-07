/**
 * Post-reveal gift list, peek, reveal and the thank-you tracker. Guest identity only leaves this
 * module when the registry is revealed, or through `peekGifts`, which is logged and never flips
 * `revealed`.
 */
import { and, asc, eq, inArray } from "drizzle-orm";
import type { DB } from "./index";
import { claim, item, registry, thankYou, type ItemType } from "./schema";
import { getRegistry, goalFor, logEdit, releaseExpired } from "./queries";
import type { Bilingual } from "@/lib/i18n";
import { effectiveStatus } from "@/lib/claims";

/** reserved / purchased as usual; "pending" is a Swish contribution not yet confirmed by the guest. */
export type GiftStatus = "reserved" | "purchased" | "pending";

export interface GiftRow {
  claimId: number;
  itemId: number;
  itemName: Bilingual;
  itemType: ItemType;
  guestName: string;
  guestEmail: string;
  qty: number;
  /** SEK for a contribution, null for a physical claim (incl. "buy the whole gift"). */
  amount: number | null;
  status: GiftStatus;
  message: string | null;
  address: string | null;
  showName: boolean;
  createdAt: Date;
  thankedAt: Date | null;
  thankNote: string | null;
}

export interface GiftGroup {
  itemId: number;
  itemName: Bilingual;
  itemType: ItemType;
  qtyWanted: number;
  goal: number | null;
  /** Physical: quantity reserved + purchased. */
  qtyClaimed: number;
  qtyPurchased: number;
  /** Funds / group gifts: confirmed contributions in SEK. */
  amountConfirmed: number;
  rows: GiftRow[];
}

/** Every active claim and contribution with guest details. Internal: callers must gate access. */
function loadGiftRows(db: DB, now: Date): GiftRow[] {
  releaseExpired(db, now);
  const rows = db
    .select({ claim, item, thank: thankYou })
    .from(claim)
    .innerJoin(item, eq(claim.itemId, item.id))
    .leftJoin(thankYou, eq(thankYou.claimId, claim.id))
    .where(inArray(claim.status, ["reserved", "purchased"]))
    .orderBy(asc(item.sortOrder), asc(item.id), asc(claim.createdAt), asc(claim.id))
    .all();
  return rows.flatMap(({ claim: c, item: it, thank }) => {
    const s = effectiveStatus(c, now);
    if (s === "released") return [];
    const status: GiftStatus = c.amount !== null && c.confirmedAt === null ? "pending" : s;
    return [
      {
        claimId: c.id,
        itemId: it.id,
        itemName: it.name,
        itemType: it.type,
        guestName: c.guestName,
        guestEmail: c.guestEmail,
        qty: c.qty,
        amount: c.amount,
        status,
        message: c.message,
        address: c.address,
        showName: c.showName,
        createdAt: c.createdAt,
        thankedAt: thank?.sentAt ?? null,
        thankNote: thank?.note ?? null,
      },
    ];
  });
}

export function groupGifts(db: DB, rows: GiftRow[]): GiftGroup[] {
  const ids = [...new Set(rows.map((r) => r.itemId))];
  if (!ids.length) return [];
  const items = new Map(db.select().from(item).where(inArray(item.id, ids)).all().map((i) => [i.id, i]));
  const groups = new Map<number, GiftGroup>();
  for (const r of rows) {
    let g = groups.get(r.itemId);
    if (!g) {
      const it = items.get(r.itemId)!;
      g = {
        itemId: it.id,
        itemName: it.name,
        itemType: it.type,
        qtyWanted: it.type === "physical" ? it.qtyWanted : 1,
        goal: it.type === "physical" ? null : goalFor(it),
        qtyClaimed: 0,
        qtyPurchased: 0,
        amountConfirmed: 0,
        rows: [],
      };
      groups.set(r.itemId, g);
    }
    g.rows.push(r);
    if (r.amount === null) {
      g.qtyClaimed += r.qty;
      if (r.status === "purchased") g.qtyPurchased += r.qty;
    } else if (r.status === "purchased") {
      g.amountConfirmed += r.amount;
    }
  }
  return [...groups.values()];
}

/** The full list with names, or null while surprise mode is on. */
export function listRevealedGifts(db: DB, now: Date = new Date()): GiftRow[] | null {
  if (!getRegistry(db).revealed) return null;
  return loadGiftRows(db, now);
}

/**
 * One-time look before reveal: returns the full list, records who peeked (dashboard + editor log)
 * and leaves `revealed` untouched.
 */
export function peekGifts(db: DB, who: string, now: Date = new Date()): GiftRow[] {
  db.update(registry).set({ lastPeekAt: now, lastPeekBy: who }).where(eq(registry.id, 1)).run();
  logEdit(db, who, `Peek by ${who}: tittade på hela listan utan att avslöja den`, now);
  return loadGiftRows(db, now);
}

export type RevealResult = { ok: true } | { ok: false; reason: "already" };

/** Permanent reveal. Idempotent: a second press does nothing. */
export function revealRegistry(db: DB, who: string, now: Date = new Date()): RevealResult {
  const res = db
    .update(registry)
    .set({ revealed: true, revealedAt: now, revealedBy: who, updatedAt: now })
    .where(and(eq(registry.id, 1), eq(registry.revealed, false)))
    .run();
  if (!res.changes) return { ok: false, reason: "already" };
  logEdit(db, who, "Avslöjade listan", now);
  return { ok: true };
}

/** Accept the typed confirmation in either language, any case. */
export function isRevealConfirmation(input: unknown): boolean {
  if (typeof input !== "string") return false;
  const v = input.trim().toLocaleUpperCase("sv-SE");
  return v === "AVSLÖJA" || v === "REVEAL";
}

export type ThankResult = { ok: true; guestName: string; itemName: string } | { ok: false };

/** Tick or untick "Tackat" for one claim. Only after reveal. */
export function setThanked(
  db: DB,
  claimId: number,
  thanked: boolean,
  note: string | null,
  now: Date = new Date(),
): ThankResult {
  if (!getRegistry(db).revealed) return { ok: false };
  const row = db
    .select({ id: claim.id, guestName: claim.guestName, itemName: item.name })
    .from(claim)
    .innerJoin(item, eq(claim.itemId, item.id))
    .where(eq(claim.id, claimId))
    .get();
  if (!row) return { ok: false };
  if (thanked) {
    db.insert(thankYou)
      .values({ claimId, sentAt: now, note })
      .onConflictDoUpdate({ target: thankYou.claimId, set: { note } })
      .run();
  } else {
    db.delete(thankYou).where(eq(thankYou.claimId, claimId)).run();
  }
  return { ok: true, guestName: row.guestName, itemName: row.itemName.sv };
}

export function thankCounts(rows: readonly GiftRow[]): { thanked: number; total: number } {
  return { thanked: rows.filter((r) => r.thankedAt !== null).length, total: rows.length };
}

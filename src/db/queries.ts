import { and, asc, desc, eq, inArray, lte } from "drizzle-orm";
import type { DB } from "./index";
import { category, claim, editorLog, item, registry, type Claim, type Item } from "./schema";
import {
  adminAggregate,
  availability,
  checkClaimQty,
  publicStatus,
  reservationExpiry,
  type AdminItemAggregate,
  type PublicItemStatus,
} from "@/lib/claims";

/** Lazy release: reserved claims past their 72 h hold are written back as released. */
export function releaseExpired(db: DB, now: Date = new Date()): number {
  const res = db
    .update(claim)
    .set({ status: "released", releasedAt: now, updatedAt: now })
    .where(and(eq(claim.status, "reserved"), lte(claim.expiresAt, now)))
    .run();
  return res.changes;
}

export function getRegistry(db: DB) {
  const row = db.select().from(registry).where(eq(registry.id, 1)).get();
  if (!row) throw new Error("Registry row missing");
  return row;
}

export function listCategories(db: DB) {
  return db.select().from(category).orderBy(asc(category.sortOrder), asc(category.id)).all();
}

type PublicClaimRow = Pick<Claim, "itemId" | "qty" | "status" | "expiresAt" | "showName" | "guestName">;

function publicClaimsFor(db: DB, itemIds: number[]): Map<number, PublicClaimRow[]> {
  const map = new Map<number, PublicClaimRow[]>();
  if (!itemIds.length) return map;
  const rows = db
    .select({
      itemId: claim.itemId,
      qty: claim.qty,
      status: claim.status,
      expiresAt: claim.expiresAt,
      showName: claim.showName,
      guestName: claim.guestName,
    })
    .from(claim)
    .where(and(inArray(claim.itemId, itemIds), inArray(claim.status, ["reserved", "purchased"])))
    .all();
  for (const r of rows) {
    const list = map.get(r.itemId) ?? [];
    list.push(r);
    map.set(r.itemId, list);
  }
  return map;
}

export type PublicItem = Item & { status: PublicItemStatus };

function withPublicStatus(db: DB, items: Item[], now: Date): PublicItem[] {
  const claims = publicClaimsFor(db, items.map((i) => i.id));
  return items.map((i) => ({ ...i, status: publicStatus(i.qtyWanted, claims.get(i.id) ?? [], now) }));
}

export function listPublicItems(db: DB, now: Date = new Date()): PublicItem[] {
  releaseExpired(db, now);
  const items = db
    .select()
    .from(item)
    .where(eq(item.visible, true))
    .orderBy(asc(item.sortOrder), asc(item.id))
    .all();
  return withPublicStatus(db, items, now);
}

export function getPublicItem(db: DB, id: number, now: Date = new Date()): PublicItem | null {
  releaseExpired(db, now);
  const row = db
    .select()
    .from(item)
    .where(and(eq(item.id, id), eq(item.visible, true)))
    .get();
  if (!row) return null;
  return withPublicStatus(db, [row], now)[0] ?? null;
}

export interface NewClaimInput {
  itemId: number;
  guestKey: string;
  guestName: string;
  guestEmail: string;
  qty: number;
  message: string | null;
  showName: boolean;
  address: string | null;
  purchased: boolean;
}

export type CreateClaimResult =
  | { ok: true; claim: Claim; item: Item; claimedAfter: number }
  | { ok: false; reason: "not_found" | "invalid" | "unavailable"; remaining: number };

/** Create a claim inside a transaction so two guests cannot take the last one together. */
export function createClaim(db: DB, input: NewClaimInput, now: Date = new Date()): CreateClaimResult {
  return db.transaction((tx) => {
    releaseExpired(tx as unknown as DB, now);
    const it = tx
      .select()
      .from(item)
      .where(and(eq(item.id, input.itemId), eq(item.visible, true)))
      .get();
    if (!it || it.type !== "physical") return { ok: false as const, reason: "not_found" as const, remaining: 0 };
    const existing = tx
      .select({ qty: claim.qty, status: claim.status, expiresAt: claim.expiresAt })
      .from(claim)
      .where(eq(claim.itemId, it.id))
      .all();
    const avail = availability(it.qtyWanted, existing, now);
    const check = checkClaimQty(input.qty, avail.remaining);
    if (!check.ok) return { ok: false as const, reason: check.reason, remaining: avail.remaining };
    const created = tx
      .insert(claim)
      .values({
        itemId: it.id,
        guestKey: input.guestKey,
        guestName: input.guestName,
        guestEmail: input.guestEmail,
        qty: input.qty,
        status: input.purchased ? "purchased" : "reserved",
        message: input.message,
        showName: input.showName,
        address: input.address,
        expiresAt: input.purchased ? null : reservationExpiry(now),
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();
    return { ok: true as const, claim: created, item: it, claimedAfter: avail.claimed + input.qty };
  });
}

export type GuestClaim = Claim & { item: Item };

export function listGuestClaims(db: DB, guestKey: string, now: Date = new Date()): GuestClaim[] {
  releaseExpired(db, now);
  const rows = db
    .select()
    .from(claim)
    .innerJoin(item, eq(claim.itemId, item.id))
    .where(and(eq(claim.guestKey, guestKey), inArray(claim.status, ["reserved", "purchased"])))
    .orderBy(desc(claim.createdAt))
    .all();
  return rows.map((r) => ({ ...r.claim, item: r.item }));
}

export function getGuestClaim(db: DB, claimId: number, guestKey: string): GuestClaim | null {
  const r = db
    .select()
    .from(claim)
    .innerJoin(item, eq(claim.itemId, item.id))
    .where(and(eq(claim.id, claimId), eq(claim.guestKey, guestKey)))
    .get();
  return r ? { ...r.claim, item: r.item } : null;
}

function claimedCount(db: DB, it: Item, now: Date): number {
  const rows = db
    .select({ qty: claim.qty, status: claim.status, expiresAt: claim.expiresAt })
    .from(claim)
    .where(eq(claim.itemId, it.id))
    .all();
  return availability(it.qtyWanted, rows, now).claimed;
}

export type GuestChangeResult = { ok: true; claim: GuestClaim; claimedAfter: number } | { ok: false };

/** Guest marks their own (still active) claim as purchased. */
export function markClaimPurchased(db: DB, claimId: number, guestKey: string, now: Date = new Date()): GuestChangeResult {
  releaseExpired(db, now);
  const c = getGuestClaim(db, claimId, guestKey);
  if (!c || c.status !== "reserved") return { ok: false };
  db.update(claim).set({ status: "purchased", expiresAt: null, updatedAt: now }).where(eq(claim.id, c.id)).run();
  return { ok: true, claim: { ...c, status: "purchased" }, claimedAfter: claimedCount(db, c.item, now) };
}

/** Guest releases (un-claims) their own claim. */
export function releaseGuestClaim(db: DB, claimId: number, guestKey: string, now: Date = new Date()): GuestChangeResult {
  const c = getGuestClaim(db, claimId, guestKey);
  if (!c || c.status === "released") return { ok: false };
  db.update(claim).set({ status: "released", releasedAt: now, updatedAt: now }).where(eq(claim.id, c.id)).run();
  return { ok: true, claim: { ...c, status: "released" }, claimedAfter: claimedCount(db, c.item, now) };
}

export type AdminItem = Item & { aggregate: AdminItemAggregate };

/**
 * Items for the editor dashboard. While surprise mode is on the claim query does not even
 * select guest columns, and only aggregate numbers are returned.
 */
export function listAdminItems(db: DB, revealed: boolean, now: Date = new Date()): AdminItem[] {
  releaseExpired(db, now);
  const items = db.select().from(item).orderBy(asc(item.sortOrder), asc(item.id)).all();
  const ids = items.map((i) => i.id);
  const byItem = new Map<number, Parameters<typeof adminAggregate>[1][number][]>();
  if (ids.length) {
    const rows = revealed
      ? db
          .select({
            itemId: claim.itemId,
            qty: claim.qty,
            status: claim.status,
            expiresAt: claim.expiresAt,
            guestName: claim.guestName,
            guestEmail: claim.guestEmail,
            message: claim.message,
            address: claim.address,
          })
          .from(claim)
          .where(and(inArray(claim.itemId, ids), inArray(claim.status, ["reserved", "purchased"])))
          .all()
      : db
          .select({ itemId: claim.itemId, qty: claim.qty, status: claim.status, expiresAt: claim.expiresAt })
          .from(claim)
          .where(and(inArray(claim.itemId, ids), inArray(claim.status, ["reserved", "purchased"])))
          .all()
          .map((r) => ({ ...r, guestName: "", guestEmail: "", message: null, address: null }));
    for (const r of rows) {
      const list = byItem.get(r.itemId) ?? [];
      list.push(r);
      byItem.set(r.itemId, list);
    }
  }
  return items.map((i) => ({ ...i, aggregate: adminAggregate(i.qtyWanted, byItem.get(i.id) ?? [], revealed, now) }));
}

export function logEdit(db: DB, who: string, what: string, now: Date = new Date()) {
  db.insert(editorLog).values({ who, what: what.slice(0, 500), createdAt: now }).run();
}

export function recentEditorLog(db: DB, limit = 20) {
  return db.select().from(editorLog).orderBy(desc(editorLog.createdAt), desc(editorLog.id)).limit(limit).all();
}

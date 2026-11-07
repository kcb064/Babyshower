import { and, asc, desc, eq, inArray, isNotNull, isNull, lte } from "drizzle-orm";
import type { DB } from "./index";
import { category, claim, editorLog, item, registry, type Claim, type Item } from "./schema";
import {
  adminAggregate,
  availability,
  canBuyWhole,
  canContribute,
  checkClaimQty,
  contributionExpiry,
  fundTotals,
  MAX_CONTRIBUTION,
  MIN_CONTRIBUTION,
  publicStatus,
  reservationExpiry,
  type AdminItemAggregate,
  type ContributionLike,
  type FundTotals,
  type PublicItemStatus,
} from "@/lib/claims";

/**
 * Lazy release: reserved claims past their 72 h hold, and Swish contributions never confirmed
 * within 24 h, are written back as released.
 */
export function releaseExpired(db: DB, now: Date = new Date()): number {
  const reserves = db
    .update(claim)
    .set({ status: "released", releasedAt: now, updatedAt: now })
    .where(and(eq(claim.status, "reserved"), lte(claim.expiresAt, now)))
    .run();
  const contributions = db
    .update(claim)
    .set({ status: "released", releasedAt: now, updatedAt: now })
    .where(and(eq(claim.status, "purchased"), isNotNull(claim.amount), isNull(claim.confirmedAt), lte(claim.expiresAt, now)))
    .run();
  return reserves.changes + contributions.changes;
}

/** Goal in SEK for a group gift or fund: explicit goal, else the price (group gifts). */
export function goalFor(it: Pick<Item, "goalAmount" | "price">): number {
  return it.goalAmount ?? it.price ?? 0;
}

type ClaimForStatus = ContributionLike & { showName?: boolean; guestName?: string };

/** Physical-style status for an item: group gifts count only "buy the whole gift" claims, qty 1. */
function itemAvailability(it: Item, claims: readonly ClaimForStatus[], now: Date) {
  if (it.type === "physical") return publicStatus(it.qtyWanted, claims, now);
  return publicStatus(1, it.type === "group" ? claims.filter((c) => c.amount === null) : [], now);
}

function itemFund(it: Item, claims: readonly ClaimForStatus[], now: Date): FundTotals | null {
  return it.type === "physical" ? null : fundTotals(goalFor(it), claims, now);
}

export function getRegistry(db: DB) {
  const row = db.select().from(registry).where(eq(registry.id, 1)).get();
  if (!row) throw new Error("Registry row missing");
  return row;
}

export function listCategories(db: DB) {
  return db.select().from(category).orderBy(asc(category.sortOrder), asc(category.id)).all();
}

type PublicClaimRow = Pick<
  Claim,
  "itemId" | "qty" | "status" | "expiresAt" | "showName" | "guestName" | "amount" | "confirmedAt" | "createdAt"
>;

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
      amount: claim.amount,
      confirmedAt: claim.confirmedAt,
      createdAt: claim.createdAt,
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

export type PublicItem = Item & { status: PublicItemStatus; fund: FundTotals | null };

function withPublicStatus(db: DB, items: Item[], now: Date): PublicItem[] {
  const claims = publicClaimsFor(db, items.map((i) => i.id));
  return items.map((i) => {
    const list = claims.get(i.id) ?? [];
    return { ...i, status: itemAvailability(i, list, now), fund: itemFund(i, list, now) };
  });
}

function claimsForItem(db: DB, itemId: number): ClaimForStatus[] {
  return db
    .select({
      qty: claim.qty,
      status: claim.status,
      expiresAt: claim.expiresAt,
      amount: claim.amount,
      confirmedAt: claim.confirmedAt,
      createdAt: claim.createdAt,
    })
    .from(claim)
    .where(and(eq(claim.itemId, itemId), inArray(claim.status, ["reserved", "purchased"])))
    .all();
}

/** Current fund totals for one item (no guest data). */
export function itemFundTotals(db: DB, it: Item, now: Date = new Date()): FundTotals {
  return fundTotals(goalFor(it), claimsForItem(db, it.id), now);
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
    if (!it || it.type === "fund") return { ok: false as const, reason: "not_found" as const, remaining: 0 };
    const existing = claimsForItem(tx as unknown as DB, it.id);
    // A group gift can be bought whole (qty 1) only while nobody has started contributing.
    if (it.type === "group" && !canBuyWhole(fundTotals(goalFor(it), existing, now))) {
      return { ok: false as const, reason: "unavailable" as const, remaining: 0 };
    }
    const avail =
      it.type === "group"
        ? availability(1, existing.filter((c) => c.amount === null), now)
        : availability(it.qtyWanted, existing, now);
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

export interface NewContributionInput {
  itemId: number;
  guestKey: string;
  guestName: string;
  guestEmail: string;
  amount: number;
  message: string | null;
  showName: boolean;
}

export type CreateContributionResult =
  | { ok: true; claim: Claim; item: Item }
  | { ok: false; reason: "not_found" | "invalid" | "unavailable" };

/**
 * Record a self-reported Swish contribution to a group gift or fund. There is no reserve state:
 * the row is `purchased` with an amount, and counts toward progress once the guest confirms it.
 */
export function createContribution(db: DB, input: NewContributionInput, now: Date = new Date()): CreateContributionResult {
  return db.transaction((tx) => {
    releaseExpired(tx as unknown as DB, now);
    const it = tx
      .select()
      .from(item)
      .where(and(eq(item.id, input.itemId), eq(item.visible, true)))
      .get();
    if (!it || it.type === "physical") return { ok: false as const, reason: "not_found" as const };
    if (!Number.isInteger(input.amount) || input.amount < MIN_CONTRIBUTION || input.amount > MAX_CONTRIBUTION) {
      return { ok: false as const, reason: "invalid" as const };
    }
    if (!canContribute(it.type, fundTotals(goalFor(it), claimsForItem(tx as unknown as DB, it.id), now))) {
      return { ok: false as const, reason: "unavailable" as const };
    }
    const created = tx
      .insert(claim)
      .values({
        itemId: it.id,
        guestKey: input.guestKey,
        guestName: input.guestName,
        guestEmail: input.guestEmail,
        qty: 1,
        status: "purchased",
        amount: input.amount,
        message: input.message,
        showName: input.showName,
        expiresAt: contributionExpiry(now),
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();
    return { ok: true as const, claim: created, item: it };
  });
}

export type ConfirmContributionResult = { ok: true; claim: GuestClaim; totals: FundTotals } | { ok: false };

/** Guest presses "I've sent it": the contribution now counts toward the progress bar. */
export function confirmContribution(db: DB, claimId: number, guestKey: string, now: Date = new Date()): ConfirmContributionResult {
  releaseExpired(db, now);
  const c = getGuestClaim(db, claimId, guestKey);
  if (!c || c.amount === null || c.status !== "purchased" || c.confirmedAt !== null) return { ok: false };
  db.update(claim).set({ confirmedAt: now, expiresAt: null, updatedAt: now }).where(eq(claim.id, c.id)).run();
  return { ok: true, claim: { ...c, confirmedAt: now, expiresAt: null }, totals: itemFundTotals(db, c.item, now) };
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
  return itemAvailability(it, claimsForItem(db, it.id), now).claimed;
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
  // Swish contributions cannot be released: the money has (or has not) been sent outside the app.
  if (!c || c.status === "released" || c.amount !== null) return { ok: false };
  db.update(claim).set({ status: "released", releasedAt: now, updatedAt: now }).where(eq(claim.id, c.id)).run();
  return { ok: true, claim: { ...c, status: "released" }, claimedAfter: claimedCount(db, c.item, now) };
}

export type AdminItem = Item & { aggregate: AdminItemAggregate; fund: FundTotals | null };

/**
 * Items for the editor dashboard. While surprise mode is on the claim query does not even
 * select guest columns, and only aggregate numbers are returned.
 */
export function listAdminItems(db: DB, revealed: boolean, now: Date = new Date()): AdminItem[] {
  releaseExpired(db, now);
  const items = db.select().from(item).orderBy(asc(item.sortOrder), asc(item.id)).all();
  const ids = items.map((i) => i.id);
  const byItem = new Map<number, (Parameters<typeof adminAggregate>[1][number] & ContributionLike)[]>();
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
            amount: claim.amount,
            confirmedAt: claim.confirmedAt,
            createdAt: claim.createdAt,
          })
          .from(claim)
          .where(and(inArray(claim.itemId, ids), inArray(claim.status, ["reserved", "purchased"])))
          .all()
      : db
          .select({
            itemId: claim.itemId,
            qty: claim.qty,
            status: claim.status,
            expiresAt: claim.expiresAt,
            amount: claim.amount,
            confirmedAt: claim.confirmedAt,
            createdAt: claim.createdAt,
          })
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
  return items.map((i) => {
    const list = byItem.get(i.id) ?? [];
    const physical = i.type === "physical" ? list : i.type === "group" ? list.filter((c) => c.amount === null) : [];
    return {
      ...i,
      aggregate: adminAggregate(i.type === "physical" ? i.qtyWanted : 1, physical, revealed, now),
      // In surprise mode guestName is blank above, so fund totals cannot carry names either.
      fund: itemFund(i, revealed ? list : list.map((c) => ({ ...c, showName: false })), now),
    };
  });
}

export function logEdit(db: DB, who: string, what: string, now: Date = new Date()) {
  db.insert(editorLog).values({ who, what: what.slice(0, 500), createdAt: now }).run();
}

export function recentEditorLog(db: DB, limit = 20) {
  return db.select().from(editorLog).orderBy(desc(editorLog.createdAt), desc(editorLog.id)).limit(limit).all();
}

/** Seeded starter suggestions, visible or not, in list order. */
export function listStarterItems(db: DB): Item[] {
  return db.select().from(item).where(eq(item.seeded, true)).orderBy(asc(item.sortOrder), asc(item.id)).all();
}

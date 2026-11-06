import { describe, expect, it, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { openDb, type DB } from "@/db";
import {
  createClaim,
  getRegistry,
  listAdminItems,
  listCategories,
  listGuestClaims,
  listPublicItems,
  markClaimPurchased,
  releaseGuestClaim,
  type NewClaimInput,
} from "@/db/queries";
import { claim, item } from "@/db/schema";

let db: DB;
const now = new Date("2026-11-10T12:00:00Z");

function addItem(qty: number, visible = true) {
  return db.insert(item).values({ name: { sv: "Babynest" }, qtyWanted: qty, visible }).returning().get();
}

const base = (itemId: number, over: Partial<NewClaimInput> = {}): NewClaimInput => ({
  itemId,
  guestKey: "g1",
  guestName: "Anna Andersson",
  guestEmail: "anna@example.com",
  qty: 1,
  message: null,
  showName: false,
  address: null,
  purchased: false,
  ...over,
});

beforeEach(() => {
  db = openDb(":memory:");
});

describe("seed", () => {
  it("creates the registry row and default categories", () => {
    const r = getRegistry(db);
    expect(r.id).toBe(1);
    expect(r.title.sv).toBe("Babyshower");
    expect(r.eventDate).toBe("2026-12-06");
    expect(r.eventTime).toBe("14:00");
    expect(r.theme).toBe("botanist");
    expect(r.revealed).toBe(false);
    const cats = listCategories(db).map((c) => `${c.name.sv}/${c.name.en}`);
    expect(cats).toEqual([
      "Sova/Sleep",
      "Mat/Feeding",
      "Bad/Bath",
      "Kläder/Clothing",
      "Blöjor/Diapering",
      "Ute/Out and about",
      "Lek/Play",
      "Böcker/Books",
      "Hälsa/Health",
    ]);
  });
});

describe("createClaim", () => {
  it("reserves with a 72 h expiry and decrements availability", () => {
    const it1 = addItem(2);
    const res = createClaim(db, base(it1.id), now);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.claim.status).toBe("reserved");
    expect(res.claim.expiresAt?.getTime()).toBe(now.getTime() + 72 * 3600 * 1000);
    expect(res.claimedAfter).toBe(1);
    expect(listPublicItems(db, now)[0]?.status.remaining).toBe(1);
  });

  it("refuses to over-claim", () => {
    const it1 = addItem(1);
    expect(createClaim(db, base(it1.id), now).ok).toBe(true);
    const second = createClaim(db, base(it1.id, { guestKey: "g2" }), now);
    expect(second).toEqual({ ok: false, reason: "unavailable", remaining: 0 });
  });

  it("refuses hidden items", () => {
    const hidden = addItem(1, false);
    expect(createClaim(db, base(hidden.id), now)).toMatchObject({ ok: false, reason: "not_found" });
  });

  it("stores purchased claims without expiry", () => {
    const it1 = addItem(1);
    const res = createClaim(db, base(it1.id, { purchased: true }), now);
    expect(res.ok && res.claim.status).toBe("purchased");
    expect(res.ok && res.claim.expiresAt).toBeNull();
  });

  it("lazily releases expired reservations and writes them back", () => {
    const it1 = addItem(1);
    const first = createClaim(db, base(it1.id), now);
    expect(first.ok).toBe(true);
    const after = new Date(now.getTime() + 73 * 3600 * 1000);
    expect(listPublicItems(db, after)[0]?.status.remaining).toBe(1);
    const row = db.select().from(claim).get();
    expect(row?.status).toBe("released");
    expect(createClaim(db, base(it1.id, { guestKey: "g2" }), after).ok).toBe(true);
  });
});

describe("guest changes", () => {
  it("only the owning guest can mark purchased or release", () => {
    const it1 = addItem(1);
    const res = createClaim(db, base(it1.id), now);
    if (!res.ok) throw new Error("claim failed");
    expect(markClaimPurchased(db, res.claim.id, "someone-else", now).ok).toBe(false);
    expect(releaseGuestClaim(db, res.claim.id, "someone-else", now).ok).toBe(false);
    expect(markClaimPurchased(db, res.claim.id, "g1", now).ok).toBe(true);
    expect(listGuestClaims(db, "g1", now)[0]?.status).toBe("purchased");
    const rel = releaseGuestClaim(db, res.claim.id, "g1", now);
    expect(rel.ok && rel.claimedAfter).toBe(0);
    expect(listGuestClaims(db, "g1", now)).toHaveLength(0);
    expect(listPublicItems(db, now)[0]?.status.remaining).toBe(1);
  });
});

describe("admin listing in surprise mode", () => {
  it("returns aggregates without any guest data until revealed", () => {
    const it1 = addItem(3);
    createClaim(db, base(it1.id, { message: "Grattis!", address: "Storgatan 1", showName: true }), now);
    createClaim(db, base(it1.id, { guestKey: "g2", guestName: "Erik", guestEmail: "erik@example.com", purchased: true }), now);
    const [row] = listAdminItems(db, false, now);
    expect(row?.aggregate).toEqual({ total: 3, qtyClaimed: 2, qtyPurchased: 1, remaining: 1, details: null });
    const json = JSON.stringify(row);
    for (const s of ["Anna", "anna@example.com", "Grattis", "Storgatan", "Erik"]) expect(json).not.toContain(s);

    const [revealed] = listAdminItems(db, true, now);
    expect(revealed?.aggregate.details).toHaveLength(2);
    db.update(item).set({ visible: false }).where(eq(item.id, it1.id)).run();
    expect(listAdminItems(db, false, now)).toHaveLength(1);
    expect(listPublicItems(db, now)).toHaveLength(0);
  });
});

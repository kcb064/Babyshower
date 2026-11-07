import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type DB } from "@/db";
import {
  groupGifts,
  isRevealConfirmation,
  listRevealedGifts,
  peekGifts,
  revealRegistry,
  setThanked,
  thankCounts,
} from "@/db/gifts";
import { confirmContribution, createClaim, createContribution, getRegistry, listAdminItems, recentEditorLog } from "@/db/queries";
import { item, thankYou } from "@/db/schema";

let db: DB;
const now = new Date("2026-11-20T12:00:00Z");

function seedGifts() {
  const nest = db.insert(item).values({ name: { sv: "Babynest" }, qtyWanted: 2, price: 1295 }).returning().get();
  const fund = db.insert(item).values({ name: { sv: "Blöjfond" }, type: "fund", goalAmount: 5000 }).returning().get();
  const c = createClaim(
    db,
    {
      itemId: nest.id,
      guestKey: "g1",
      guestName: "Anna Andersson",
      guestEmail: "anna@example.com",
      qty: 1,
      message: "Grattis!",
      showName: false,
      address: "Storgatan 1",
      purchased: true,
    },
    now,
  );
  const k = createContribution(
    db,
    { itemId: fund.id, guestKey: "g2", guestName: "Bo Berg", guestEmail: "bo@example.com", amount: 300, message: null, showName: true },
    now,
  );
  if (!c.ok || !k.ok) throw new Error("seed failed");
  confirmContribution(db, k.claim.id, "g2", now);
  createContribution(
    db,
    { itemId: fund.id, guestKey: "g3", guestName: "Cia", guestEmail: "cia@example.com", amount: 200, message: null, showName: false },
    now,
  );
  return { nest, fund, claimId: c.claim.id, contributionId: k.claim.id };
}

beforeEach(() => {
  db = openDb(":memory:");
});

describe("surprise mode", () => {
  it("admin queries return names only when revealed", () => {
    seedGifts();
    expect(listRevealedGifts(db, now)).toBeNull();
    const pre = JSON.stringify(listAdminItems(db, getRegistry(db).revealed, now));
    expect(pre).not.toContain("Anna");
    expect(pre).not.toContain("anna@example.com");
    expect(pre).not.toContain("Grattis");
    expect(pre).not.toContain("Storgatan");

    revealRegistry(db, "Mira", now);
    const rows = listRevealedGifts(db, now)!;
    expect(rows.map((r) => r.guestName)).toEqual(["Anna Andersson", "Bo Berg", "Cia"]);
    expect(rows[0]).toMatchObject({ guestEmail: "anna@example.com", message: "Grattis!", address: "Storgatan 1", status: "purchased" });
    expect(rows[2]!.status).toBe("pending");
    expect(listAdminItems(db, true, now)[0]!.aggregate.details?.[0]?.guestName).toBe("Anna Andersson");
  });
});

describe("peek", () => {
  it("shows the full list, records who peeked and never flips revealed", () => {
    seedGifts();
    const rows = peekGifts(db, "Lisa", now);
    expect(rows.map((r) => r.guestName)).toContain("Anna Andersson");
    const reg = getRegistry(db);
    expect(reg.revealed).toBe(false);
    expect(reg.revealedAt).toBeNull();
    expect(reg.lastPeekBy).toBe("Lisa");
    expect(reg.lastPeekAt?.getTime()).toBe(now.getTime());
    expect(recentEditorLog(db)[0]).toMatchObject({ who: "Lisa" });
    expect(recentEditorLog(db)[0]!.what).toContain("Peek by Lisa");
    // Still hidden for everything else.
    expect(listRevealedGifts(db, now)).toBeNull();
    peekGifts(db, "Lisa", now);
    expect(getRegistry(db).revealed).toBe(false);
  });
});

describe("reveal", () => {
  it("is permanent, attributed and idempotent", () => {
    expect(revealRegistry(db, "Mira", now)).toEqual({ ok: true });
    const reg = getRegistry(db);
    expect(reg).toMatchObject({ revealed: true, revealedBy: "Mira" });
    expect(reg.revealedAt?.getTime()).toBe(now.getTime());
    expect(revealRegistry(db, "Lisa", new Date(now.getTime() + 1000))).toEqual({ ok: false, reason: "already" });
    expect(getRegistry(db).revealedBy).toBe("Mira");
    expect(recentEditorLog(db).filter((l) => l.what === "Avslöjade listan")).toHaveLength(1);
  });

  it("needs the typed confirmation", () => {
    expect(isRevealConfirmation("AVSLÖJA")).toBe(true);
    expect(isRevealConfirmation(" avslöja ")).toBe(true);
    expect(isRevealConfirmation("REVEAL")).toBe(true);
    expect(isRevealConfirmation("reveal")).toBe(true);
    expect(isRevealConfirmation("ja")).toBe(false);
    expect(isRevealConfirmation("")).toBe(false);
    expect(isRevealConfirmation(null)).toBe(false);
  });
});

describe("gift groups", () => {
  it("groups by item with totals; funds list every contribution", () => {
    seedGifts();
    revealRegistry(db, "Mira", now);
    const groups = groupGifts(db, listRevealedGifts(db, now)!);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ qtyWanted: 2, qtyClaimed: 1, qtyPurchased: 1 });
    expect(groups[1]).toMatchObject({ itemType: "fund", goal: 5000, amountConfirmed: 300 });
    expect(groups[1]!.rows.map((r) => r.amount)).toEqual([300, 200]);
  });
});

describe("thank-you tracker", () => {
  it("is refused before reveal", () => {
    const { claimId } = seedGifts();
    expect(setThanked(db, claimId, true, null, now)).toEqual({ ok: false });
    expect(db.select().from(thankYou).all()).toHaveLength(0);
  });

  it("ticks, updates the note, and unticks", () => {
    const { claimId } = seedGifts();
    revealRegistry(db, "Mira", now);
    expect(setThanked(db, claimId, true, null, now).ok).toBe(true);
    expect(thankCounts(listRevealedGifts(db, now)!)).toEqual({ thanked: 1, total: 3 });
    setThanked(db, claimId, true, "Kort skickat", new Date(now.getTime() + 60_000));
    const rows = db.select().from(thankYou).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ claimId, note: "Kort skickat" });
    expect(rows[0]!.sentAt?.getTime()).toBe(now.getTime());
    const listed = listRevealedGifts(db, now)!.find((r) => r.claimId === claimId)!;
    expect(listed.thankNote).toBe("Kort skickat");
    setThanked(db, claimId, false, null, now);
    expect(db.select().from(thankYou).all()).toHaveLength(0);
    expect(thankCounts(listRevealedGifts(db, now)!)).toEqual({ thanked: 0, total: 3 });
  });
});

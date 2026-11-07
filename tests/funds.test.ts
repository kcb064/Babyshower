import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { openDb, type DB } from "@/db";
import {
  confirmContribution,
  createClaim,
  createContribution,
  getPublicItem,
  listAdminItems,
  listGuestClaims,
  listPublicItems,
  releaseGuestClaim,
  type NewContributionInput,
} from "@/db/queries";
import { claim, item } from "@/db/schema";
import { canBuyWhole, fundTotals, type ContributionLike } from "@/lib/claims";
import { contributionSchema, itemSchema } from "@/lib/validation";
import { ntfyContributionMessage } from "@/lib/ntfy";

const now = new Date("2026-11-10T12:00:00Z");
const hours = (h: number) => new Date(now.getTime() + h * 3600 * 1000);

describe("fundTotals (pure)", () => {
  const c = (over: Partial<ContributionLike>): ContributionLike => ({
    qty: 1,
    status: "purchased",
    expiresAt: null,
    amount: 300,
    confirmedAt: now,
    createdAt: now,
    ...over,
  });

  it("counts only confirmed contributions", () => {
    const t = fundTotals(
      5000,
      [c({ amount: 300 }), c({ amount: 2800 }), c({ amount: 500, confirmedAt: null, expiresAt: hours(24) })],
      hours(1),
    );
    expect(t).toMatchObject({
      goal: 5000,
      confirmed: 3100,
      contributors: 2,
      pending: 1,
      percent: 62,
      covered: false,
      boughtWhole: false,
    });
  });

  it("ignores unconfirmed contributions older than 24 h, even before they are written back", () => {
    const pending = c({ amount: 500, confirmedAt: null, createdAt: now });
    expect(fundTotals(1000, [pending], hours(23)).pending).toBe(1);
    expect(fundTotals(1000, [pending], hours(24)).pending).toBe(0);
    expect(fundTotals(1000, [pending], hours(24)).confirmed).toBe(0);
    expect(fundTotals(1000, [c({ status: "released" })], now).confirmed).toBe(0);
  });

  it("caps the percent at 100 and flags covered", () => {
    const t = fundTotals(500, [c({ amount: 700 })], now);
    expect(t.percent).toBe(100);
    expect(t.covered).toBe(true);
  });

  it("treats a whole-gift claim as fully covered", () => {
    const whole = c({ amount: null, confirmedAt: null, status: "reserved", expiresAt: hours(72) });
    const t = fundTotals(4000, [whole], now);
    expect(t).toMatchObject({ boughtWhole: true, covered: true, percent: 100, confirmed: 0 });
    expect(fundTotals(4000, [whole], hours(73)).boughtWhole).toBe(false);
  });

  it("only names confirmed contributors who opted in", () => {
    const t = fundTotals(
      1000,
      [
        c({ showName: true, guestName: "Anna Andersson" }),
        c({ showName: false, guestName: "Erik" }),
        c({ showName: true, guestName: "Lisa", confirmedAt: null }),
      ],
      now,
    );
    expect(t.names).toEqual(["Anna"]);
  });
});

describe("contributions in the database", () => {
  let db: DB;
  const base = (itemId: number, over: Partial<NewContributionInput> = {}): NewContributionInput => ({
    itemId,
    guestKey: "g1",
    guestName: "Anna Andersson",
    guestEmail: "anna@example.com",
    amount: 300,
    message: null,
    showName: false,
    ...over,
  });
  const addFund = (goal = 5000) =>
    db
      .insert(item)
      .values({ type: "fund", name: { sv: "Blöjfond" }, goalAmount: goal })
      .returning()
      .get();
  const addGroup = (price = 4000, goal: number | null = null) =>
    db
      .insert(item)
      .values({ type: "group", name: { sv: "Barnvagn" }, price, goalAmount: goal })
      .returning()
      .get();

  beforeEach(() => {
    db = openDb(":memory:");
  });

  it("creates an unconfirmed purchased claim with an amount and a 24 h window", () => {
    const f = addFund();
    const res = createContribution(db, base(f.id), now);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.claim).toMatchObject({ status: "purchased", amount: 300, qty: 1, confirmedAt: null });
    expect(res.claim.expiresAt?.getTime()).toBe(hours(24).getTime());
    expect(getPublicItem(db, f.id, now)?.fund).toMatchObject({ confirmed: 0, contributors: 0, pending: 1 });
  });

  it("counts toward the progress bar once confirmed, and only by the same guest", () => {
    const f = addFund();
    const res = createContribution(db, base(f.id), now);
    if (!res.ok) throw new Error("contribution failed");
    expect(confirmContribution(db, res.claim.id, "someone-else", hours(1)).ok).toBe(false);
    const ok = confirmContribution(db, res.claim.id, "g1", hours(1));
    expect(ok.ok && ok.totals).toMatchObject({ confirmed: 300, contributors: 1, pending: 0, percent: 6 });
    expect(confirmContribution(db, res.claim.id, "g1", hours(2)).ok).toBe(false);
    expect(listPublicItems(db, hours(100))[0]?.fund?.confirmed).toBe(300);
  });

  it("lazily drops contributions never confirmed within 24 h", () => {
    const f = addFund();
    const res = createContribution(db, base(f.id), now);
    if (!res.ok) throw new Error("contribution failed");
    expect(listGuestClaims(db, "g1", hours(23))).toHaveLength(1);
    expect(listPublicItems(db, hours(25))[0]?.fund?.pending).toBe(0);
    expect(db.select().from(claim).where(eq(claim.id, res.claim.id)).get()?.status).toBe("released");
    expect(confirmContribution(db, res.claim.id, "g1", hours(25)).ok).toBe(false);
    expect(listGuestClaims(db, "g1", hours(25))).toHaveLength(0);
  });

  it("validates amounts and rejects physical or hidden items", () => {
    const f = addFund();
    expect(createContribution(db, base(f.id, { amount: 19 }), now)).toEqual({ ok: false, reason: "invalid" });
    expect(createContribution(db, base(f.id, { amount: 20 }), now).ok).toBe(true);
    const phys = db
      .insert(item)
      .values({ name: { sv: "Bodys" } })
      .returning()
      .get();
    expect(createContribution(db, base(phys.id), now)).toEqual({ ok: false, reason: "not_found" });
    const hidden = db
      .insert(item)
      .values({ type: "fund", name: { sv: "Dold" }, goalAmount: 100, visible: false })
      .returning()
      .get();
    expect(createContribution(db, base(hidden.id), now)).toEqual({ ok: false, reason: "not_found" });
  });

  it("contributions cannot be released from my claims", () => {
    const f = addFund();
    const res = createContribution(db, base(f.id), now);
    if (!res.ok) throw new Error("contribution failed");
    expect(releaseGuestClaim(db, res.claim.id, "g1", now).ok).toBe(false);
  });

  it("keeps a fund open past its goal but closes a covered group gift", () => {
    const f = addFund(100);
    const g = addGroup(100);
    for (const it of [f, g]) {
      const r = createContribution(db, base(it.id, { amount: 100 }), now);
      if (!r.ok) throw new Error("contribution failed");
      confirmContribution(db, r.claim.id, "g1", now);
    }
    expect(createContribution(db, base(f.id), now).ok).toBe(true);
    expect(createContribution(db, base(g.id), now)).toEqual({ ok: false, reason: "unavailable" });
  });

  it("group gift goal defaults to the price", () => {
    const g = addGroup(4000);
    expect(getPublicItem(db, g.id, now)?.fund?.goal).toBe(4000);
    const g2 = addGroup(4000, 3000);
    expect(getPublicItem(db, g2.id, now)?.fund?.goal).toBe(3000);
  });

  it("buying a group gift whole covers the goal and blocks contributions", () => {
    const g = addGroup(4000);
    const whole = createClaim(
      db,
      {
        itemId: g.id,
        guestKey: "g2",
        guestName: "Erik",
        guestEmail: "erik@example.com",
        qty: 1,
        message: null,
        showName: false,
        address: null,
        purchased: false,
      },
      now,
    );
    expect(whole.ok && whole.claim.amount).toBeNull();
    const pub = getPublicItem(db, g.id, now);
    expect(pub?.fund).toMatchObject({ boughtWhole: true, covered: true, percent: 100 });
    expect(pub?.status.remaining).toBe(0);
    expect(createContribution(db, base(g.id), now)).toEqual({ ok: false, reason: "unavailable" });
    // A second "buy whole" is refused too.
    expect(
      createClaim(
        db,
        {
          itemId: g.id,
          guestKey: "g3",
          guestName: "Lisa",
          guestEmail: "l@example.com",
          qty: 1,
          message: null,
          showName: false,
          address: null,
          purchased: true,
        },
        now,
      ).ok,
    ).toBe(false);
    // Releasing the whole claim reopens the gift.
    if (!whole.ok) return;
    expect(releaseGuestClaim(db, whole.claim.id, "g2", now).ok).toBe(true);
    expect(getPublicItem(db, g.id, now)?.fund?.boughtWhole).toBe(false);
    expect(createContribution(db, base(g.id), now).ok).toBe(true);
  });

  it("cannot buy a group gift whole once others have started contributing", () => {
    const g = addGroup(4000);
    expect(createContribution(db, base(g.id), now).ok).toBe(true);
    expect(canBuyWhole(getPublicItem(db, g.id, now)!.fund!)).toBe(false);
    const res = createClaim(
      db,
      {
        itemId: g.id,
        guestKey: "g2",
        guestName: "Erik",
        guestEmail: "erik@example.com",
        qty: 1,
        message: null,
        showName: false,
        address: null,
        purchased: false,
      },
      now,
    );
    expect(res).toMatchObject({ ok: false, reason: "unavailable" });
  });

  it("cash funds cannot be claimed like physical items", () => {
    const f = addFund();
    const res = createClaim(
      db,
      {
        itemId: f.id,
        guestKey: "g2",
        guestName: "Erik",
        guestEmail: "erik@example.com",
        qty: 1,
        message: null,
        showName: false,
        address: null,
        purchased: false,
      },
      now,
    );
    expect(res).toMatchObject({ ok: false, reason: "not_found" });
  });

  it("admin sees fund aggregates without any guest data in surprise mode", () => {
    const f = addFund(5000);
    const a = createContribution(db, base(f.id, { amount: 300, showName: true, message: "Grattis!" }), now);
    createContribution(db, base(f.id, { guestKey: "g2", guestName: "Erik", guestEmail: "erik@example.com", amount: 200 }), now);
    if (!a.ok) throw new Error("contribution failed");
    confirmContribution(db, a.claim.id, "g1", now);
    const row = listAdminItems(db, false, now).find((i) => i.id === f.id);
    expect(row?.fund).toMatchObject({ confirmed: 300, contributors: 1, pending: 1, names: [] });
    const json = JSON.stringify(row);
    for (const s of ["Anna", "anna@example.com", "Grattis", "Erik"]) expect(json).not.toContain(s);
  });
});

describe("contribution and item validation", () => {
  it("accepts preset and free amounts, min 20", () => {
    const base = { itemId: "1", name: "Anna", email: "anna@example.com" };
    expect(contributionSchema.safeParse({ ...base, amount: "300" }).data?.amount).toBe(300);
    expect(contributionSchema.safeParse({ ...base, amount: "1 000 kr" }).data?.amount).toBe(1000);
    expect(contributionSchema.safeParse({ ...base, amount: "250,00" }).data?.amount).toBe(250);
    expect(contributionSchema.safeParse({ ...base, amount: "19" }).success).toBe(false);
    expect(contributionSchema.safeParse({ ...base, amount: "abc" }).success).toBe(false);
    expect(contributionSchema.safeParse({ ...base, amount: "" }).success).toBe(false);
  });

  it("requires a goal for funds and falls back to price for group gifts", () => {
    const base = { nameSv: "Blöjfond", qtyWanted: "1", priority: "nice", categoryId: "", price: "" };
    expect(itemSchema.safeParse({ ...base, type: "fund", goalAmount: "" }).success).toBe(false);
    expect(itemSchema.safeParse({ ...base, type: "fund", goalAmount: "5000" }).data?.goalAmount).toBe(5000);
    expect(itemSchema.safeParse({ ...base, type: "group", goalAmount: "", price: "4000" }).success).toBe(true);
    expect(itemSchema.safeParse({ ...base, type: "group", goalAmount: "", price: "" }).success).toBe(false);
    expect(itemSchema.safeParse({ ...base }).data?.type).toBe("physical");
  });
});

describe("ntfy contribution message", () => {
  it("reads like the spec and never names the guest in surprise mode", () => {
    const msg = ntfyContributionMessage({
      itemName: "Blöjfond",
      amount: 300,
      confirmed: 3100,
      goal: 5000,
      guestName: "Anna",
      revealed: false,
    });
    expect(msg).toBe("Nytt bidrag: Blöjfond 300 kr (3 100 / 5 000)");
    expect(
      ntfyContributionMessage({
        itemName: "Blöjfond",
        amount: 300,
        confirmed: 300,
        goal: 5000,
        guestName: "Anna",
        revealed: true,
      }),
    ).toContain("Anna");
  });
});

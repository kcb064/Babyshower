import { describe, expect, it } from "vitest";
import {
  adminAggregate,
  availability,
  checkClaimQty,
  publicStatus,
  type AdminClaimInput,
} from "@/lib/claims";

describe("availability", () => {
  it("counts reserved and purchased, ignoring released", () => {
    const a = availability(4, [
      { qty: 1, status: "reserved" },
      { qty: 1, status: "purchased" },
      { qty: 2, status: "released" },
      { qty: 1, status: "reserved" },
    ]);
    expect(a).toEqual({ total: 4, reserved: 2, purchased: 1, claimed: 3, remaining: 1 });
  });

  it("never reports negative remaining", () => {
    expect(availability(1, [{ qty: 3, status: "purchased" }]).remaining).toBe(0);
  });

  it("validates requested quantities", () => {
    expect(checkClaimQty(1, 1)).toEqual({ ok: true });
    expect(checkClaimQty(2, 1)).toEqual({ ok: false, reason: "unavailable" });
    expect(checkClaimQty(1, 0)).toEqual({ ok: false, reason: "unavailable" });
    expect(checkClaimQty(0, 3)).toEqual({ ok: false, reason: "invalid" });
    expect(checkClaimQty(1.5, 3)).toEqual({ ok: false, reason: "invalid" });
  });
});

describe("public status", () => {
  it("shows only first names of guests who opted in", () => {
    const s = publicStatus(
      3,
      [
        { qty: 1, status: "reserved", showName: false, guestName: "Hidden Person" },
        { qty: 1, status: "purchased", showName: true, guestName: "Anna Andersson" },
        { qty: 1, status: "released", showName: true, guestName: "Gone Guest" },
      ],
    );
    expect(s.names).toEqual(["Anna"]);
    expect(s.claimed).toBe(2);
    expect(JSON.stringify(s)).not.toContain("Hidden");
  });
});

describe("surprise-mode aggregation", () => {
  const claims: AdminClaimInput[] = [
    {
      qty: 1,
      status: "reserved",
      guestName: "Anna Andersson",
      guestEmail: "anna@example.com",
      message: "Grattis!",
      address: "Storgatan 1",
      showName: true,
    },
    {
      qty: 2,
      status: "purchased",
      guestName: "Erik",
      guestEmail: "erik@example.com",
      message: null,
      address: null,
    },
    { qty: 1, status: "released", guestName: "Old", guestEmail: "old@example.com", message: null, address: null },
  ];

  it("returns only aggregate numbers while not revealed", () => {
    const agg = adminAggregate(5, claims, false);
    expect(agg).toEqual({ total: 5, qtyClaimed: 3, qtyPurchased: 2, remaining: 2, details: null });
    const json = JSON.stringify(agg);
    for (const secret of ["Anna", "anna@example.com", "Grattis", "Storgatan", "Erik"]) expect(json).not.toContain(secret);
  });

  it("includes active claim details once revealed", () => {
    const agg = adminAggregate(5, claims, true);
    expect(agg.details).toHaveLength(2);
    expect(agg.details?.[0]).toMatchObject({ guestName: "Anna Andersson", message: "Grattis!", status: "reserved" });
    expect(agg.details?.[1]).toMatchObject({ guestName: "Erik", status: "purchased" });
  });
});

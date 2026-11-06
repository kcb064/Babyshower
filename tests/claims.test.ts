import { describe, expect, it } from "vitest";
import {
  adminAggregate,
  availability,
  checkClaimQty,
  effectiveStatus,
  isExpired,
  publicStatus,
  reservationExpiry,
  RESERVE_MS,
  type AdminClaimInput,
} from "@/lib/claims";

const now = new Date("2026-11-10T12:00:00Z");
const later = (ms: number) => new Date(now.getTime() + ms);

describe("expiry", () => {
  it("reserved claims hold for 72 hours", () => {
    expect(reservationExpiry(now).getTime() - now.getTime()).toBe(72 * 3600 * 1000);
    expect(RESERVE_MS).toBe(72 * 3600 * 1000);
  });

  it("treats a reserved claim past expiresAt as released", () => {
    const c = { status: "reserved" as const, expiresAt: later(-1) };
    expect(isExpired(c, now)).toBe(true);
    expect(effectiveStatus(c, now)).toBe("released");
  });

  it("expiry is inclusive at the exact instant", () => {
    expect(isExpired({ status: "reserved", expiresAt: now }, now)).toBe(true);
  });

  it("never expires purchased claims", () => {
    const c = { status: "purchased" as const, expiresAt: later(-1000) };
    expect(isExpired(c, now)).toBe(false);
    expect(effectiveStatus(c, now)).toBe("purchased");
  });

  it("keeps an unexpired reservation", () => {
    expect(effectiveStatus({ status: "reserved", expiresAt: later(1) }, now)).toBe("reserved");
  });
});

describe("availability", () => {
  it("counts reserved and purchased, ignoring released and expired", () => {
    const a = availability(
      4,
      [
        { qty: 1, status: "reserved", expiresAt: later(1000) },
        { qty: 1, status: "purchased", expiresAt: null },
        { qty: 2, status: "released", expiresAt: null },
        { qty: 1, status: "reserved", expiresAt: later(-1000) },
      ],
      now,
    );
    expect(a).toEqual({ total: 4, reserved: 1, purchased: 1, claimed: 2, remaining: 2 });
  });

  it("never reports negative remaining", () => {
    expect(availability(1, [{ qty: 3, status: "purchased", expiresAt: null }], now).remaining).toBe(0);
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
        { qty: 1, status: "reserved", expiresAt: later(1000), showName: false, guestName: "Hidden Person" },
        { qty: 1, status: "purchased", expiresAt: null, showName: true, guestName: "Anna Andersson" },
        { qty: 1, status: "released", expiresAt: null, showName: true, guestName: "Gone Guest" },
      ],
      now,
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
      expiresAt: later(1000),
      guestName: "Anna Andersson",
      guestEmail: "anna@example.com",
      message: "Grattis!",
      address: "Storgatan 1",
      showName: true,
    },
    {
      qty: 2,
      status: "purchased",
      expiresAt: null,
      guestName: "Erik",
      guestEmail: "erik@example.com",
      message: null,
      address: null,
    },
    { qty: 1, status: "reserved", expiresAt: later(-1), guestName: "Old", guestEmail: "old@example.com", message: null, address: null },
  ];

  it("returns only aggregate numbers while not revealed", () => {
    const agg = adminAggregate(5, claims, false, now);
    expect(agg).toEqual({ total: 5, qtyClaimed: 3, qtyPurchased: 2, remaining: 2, details: null });
    const json = JSON.stringify(agg);
    for (const secret of ["Anna", "anna@example.com", "Grattis", "Storgatan", "Erik"]) expect(json).not.toContain(secret);
  });

  it("includes active claim details once revealed", () => {
    const agg = adminAggregate(5, claims, true, now);
    expect(agg.details).toHaveLength(2);
    expect(agg.details?.[0]).toMatchObject({ guestName: "Anna Andersson", message: "Grattis!", status: "reserved" });
    expect(agg.details?.[1]).toMatchObject({ guestName: "Erik", status: "purchased" });
  });
});

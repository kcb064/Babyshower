import { describe, expect, it } from "vitest";
import {
  buildSwishPayload,
  buildSwishUrl,
  formatSwishNumber,
  normalizeAmount,
  normalizeSwishNumber,
  parseSwishNumber,
  swishMessage,
  truncateMessage,
  buildSwishQrText,
} from "@/lib/swish";
import { registrySchema } from "@/lib/validation";

describe("Swish payload", () => {
  it("builds the exact JSON shape with payee and amount locked and message editable", () => {
    expect(buildSwishPayload({ payee: "0701234567", amount: 300, message: "Babyshower: Blöjfond" })).toEqual({
      version: 1,
      payee: { value: "0701234567", editable: false },
      amount: { value: 300, editable: false },
      message: { value: "Babyshower: Blöjfond", editable: true },
    });
  });

  it("URL-encodes the payload into a swish:// deep link that round-trips", () => {
    const url = buildSwishUrl({ payee: "123 456 78 90", amount: 500, message: "Babyshower: Blöjfond & mer" });
    expect(url.startsWith("swish://payment?data=")).toBe(true);
    const data = url.slice("swish://payment?data=".length);
    expect(data).not.toMatch(/[{}"\s&ö]/);
    expect(data).toContain("%7B%22version%22%3A1");
    const decoded = JSON.parse(decodeURIComponent(data));
    expect(decoded.payee.value).toBe("1234567890");
    expect(decoded.amount.value).toBe(500);
    expect(decoded.message.value).toBe("Babyshower: Blöjfond & mer");
  });

  it("normalises amounts to whole SEK", () => {
    expect(normalizeAmount(300)).toBe(300);
    expect(normalizeAmount(299.6)).toBe(300);
    expect(normalizeAmount(250.4)).toBe(250);
    expect(buildSwishPayload({ payee: "0701234567", amount: 99.5, message: "x" }).amount.value).toBe(100);
    expect(() => normalizeAmount(0)).toThrow();
    expect(() => normalizeAmount(0.4)).toThrow();
    expect(() => normalizeAmount(-20)).toThrow();
    expect(() => normalizeAmount(Number.NaN)).toThrow();
    expect(() => normalizeAmount(Number.POSITIVE_INFINITY)).toThrow();
  });

  it("truncates the message to 50 characters, counting å/ä/ö and emoji as one", () => {
    const long = "Babyshower: Blöjfond för den lilla – tack så hemskt mycket för allt!";
    const cut = truncateMessage(long);
    expect(Array.from(cut).length).toBeLessThanOrEqual(50);
    expect(long.startsWith(cut)).toBe(true);
    expect(truncateMessage("  hej   då  ")).toBe("hej då");
    const emoji = "🌿".repeat(60);
    expect(Array.from(truncateMessage(emoji))).toHaveLength(50);
    expect(swishMessage("Blöjfond", "sv")).toBe("Babyshower: Blöjfond");
    expect(swishMessage("Nappy fund", "en")).toBe("Baby shower: Nappy fund");
    expect(Array.from(swishMessage("x".repeat(80), "sv"))).toHaveLength(50);
  });

  it("rejects a missing payee", () => {
    expect(() => buildSwishPayload({ payee: null, amount: 100, message: "x" })).toThrow(/payee/);
    expect(() => buildSwishPayload({ payee: "", amount: 100, message: "x" })).toThrow(/payee/);
    expect(() => buildSwishUrl({ payee: "   ", amount: 100, message: "x" })).toThrow(/payee/);
  });
});

describe("Swish QR text (in-app scanner format)", () => {
  it("encodes C<number>;<amount>;<message>;<lock> with number and amount locked", () => {
    expect(buildSwishQrText({ payee: "070-123 45 67", amount: 300, message: "Babyshower: Blöjfond" })).toBe(
      "C0701234567;300;Babyshower: Blöjfond;4",
    );
  });
  it("rounds the amount and strips semicolons from the message", () => {
    expect(buildSwishQrText({ payee: "0701234567", amount: 299.6, message: "a;b" })).toBe("C0701234567;300;a,b;4");
  });
  it("rejects a missing payee", () => {
    expect(() => buildSwishQrText({ payee: "", amount: 100, message: "x" })).toThrow();
  });
});

describe("Swish number validation", () => {
  it("normalises spaces, dashes and +46", () => {
    expect(normalizeSwishNumber("070-123 45 67")).toBe("0701234567");
    expect(normalizeSwishNumber("+46 70 123 45 67")).toBe("0701234567");
    expect(normalizeSwishNumber("+46 (0)70-123 45 67")).toBe("0701234567");
    expect(normalizeSwishNumber("0046701234567")).toBe("0701234567");
    expect(normalizeSwishNumber("46701234567")).toBe("0701234567");
    expect(normalizeSwishNumber("123-456 78 90")).toBe("1234567890");
    expect(normalizeSwishNumber("")).toBeNull();
    expect(normalizeSwishNumber("abc")).toBeNull();
  });

  it("accepts 07x mobiles and 123 Swish numbers only", () => {
    expect(parseSwishNumber("070 123 45 67")).toEqual({ ok: true, value: "0701234567" });
    expect(parseSwishNumber("0729876543")).toEqual({ ok: true, value: "0729876543" });
    expect(parseSwishNumber("1231181189")).toEqual({ ok: true, value: "1231181189" });
    expect(parseSwishNumber("")).toEqual({ ok: true, value: null });
    expect(parseSwishNumber(undefined)).toEqual({ ok: true, value: null });
    for (const bad of ["08-123 456 78", "070123456", "07012345678", "1241181189", "123118118", "+4581234567", "07O1234567"]) {
      expect(parseSwishNumber(bad), bad).toEqual({ ok: false });
    }
  });

  it("is enforced by the registry settings schema", () => {
    const base = { titleSv: "Babyshower", eventDate: "2026-12-06", eventTime: "14:00" };
    const ok = registrySchema.safeParse({ ...base, swishNumber: "+46 70-123 45 67" });
    expect(ok.success && ok.data.swishNumber).toBe("0701234567");
    const blank = registrySchema.safeParse({ ...base, swishNumber: "" });
    expect(blank.success && blank.data.swishNumber).toBeNull();
    const bad = registrySchema.safeParse({ ...base, swishNumber: "08-123 45 67" });
    expect(bad.success).toBe(false);
    expect(bad.error?.issues[0]?.path).toEqual(["swishNumber"]);
  });

  it("formats for display", () => {
    expect(formatSwishNumber("0701234567")).toBe("070-123 45 67");
    expect(formatSwishNumber("1231181189")).toBe("123 118 11 89");
  });
});

import { describe, expect, it } from "vitest";
import { formatEventDate, formatEventDateTime, formatSEK } from "@/lib/format";

const NBSP = " ";

describe("formatSEK", () => {
  it("uses non-breaking spaces for thousands and before kr", () => {
    expect(formatSEK(1295)).toBe(`1${NBSP}295${NBSP}kr`);
    expect(formatSEK(1295).replace(/ /g, " ")).toBe("1 295 kr");
  });
  it("handles small, large and fractional amounts", () => {
    expect(formatSEK(0)).toBe(`0${NBSP}kr`);
    expect(formatSEK(99)).toBe(`99${NBSP}kr`);
    expect(formatSEK(1000000)).toBe(`1${NBSP}000${NBSP}000${NBSP}kr`);
    expect(formatSEK(499.6)).toBe(`500${NBSP}kr`);
    expect(formatSEK(-1500)).toBe(`-1${NBSP}500${NBSP}kr`);
  });
});

describe("event date", () => {
  it("formats in Swedish and English without timezone drift", () => {
    expect(formatEventDate("2026-12-06", "sv")).toBe("söndag 6 december 2026");
    expect(formatEventDate("2026-12-06", "en")).toMatch(/Sunday,? 6 December 2026/);
    expect(formatEventDateTime("2026-12-06", "14:00", "sv")).toBe("söndag 6 december 2026 kl. 14:00");
    expect(formatEventDateTime("2026-12-06", "14:00", "en")).toMatch(/at 14:00$/);
  });
  it("returns unparseable input unchanged", () => {
    expect(formatEventDate("snart", "sv")).toBe("snart");
  });
});

import { describe, expect, it } from "vitest";
import sv from "../messages/sv.json";
import en from "../messages/en.json";
import { bilingual, normalizeLocale, t2 } from "@/lib/i18n";

describe("t2", () => {
  it("returns the active locale when present", () => {
    expect(t2({ sv: "Babynest", en: "Baby nest" }, "en")).toBe("Baby nest");
    expect(t2({ sv: "Babynest", en: "Baby nest" }, "sv")).toBe("Babynest");
  });
  it("falls back to Swedish when English is missing or blank", () => {
    expect(t2({ sv: "Blöjfond" }, "en")).toBe("Blöjfond");
    expect(t2({ sv: "Blöjfond", en: "" }, "en")).toBe("Blöjfond");
    expect(t2({ sv: "Blöjfond", en: "   " }, "en")).toBe("Blöjfond");
    expect(t2({ sv: "Blöjfond", en: null }, "en")).toBe("Blöjfond");
  });
  it("handles null fields", () => {
    expect(t2(null, "sv")).toBe("");
  });
  it("bilingual() drops a blank English half", () => {
    expect(bilingual(" Sova ", " ")).toEqual({ sv: "Sova" });
    expect(bilingual("Sova", "Sleep")).toEqual({ sv: "Sova", en: "Sleep" });
  });
});

describe("locales", () => {
  it("defaults to Swedish", () => {
    expect(normalizeLocale(undefined)).toBe("sv");
    expect(normalizeLocale("de")).toBe("sv");
    expect(normalizeLocale("en")).toBe("en");
  });

  it("message files have identical keys", () => {
    const keys = (o: object, p = ""): string[] =>
      Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? keys(v, `${p}${k}.`) : [`${p}${k}`]));
    expect(keys(en).sort()).toEqual(keys(sv).sort());
  });

  it("uses natural Swedish copy for key actions", () => {
    expect(sv.item.claim).toBe("Jag tar den");
    expect(sv.claim.showName).toBe("Visa mitt namn för andra gäster");
    expect(sv.item.reserved).toBe("Reserverad");
  });
});

import { describe, expect, it } from "vitest";
import { buildCsv, csvCell, CSV_BOM, GIFT_CSV_HEADER, giftsCsv } from "@/lib/csv";

describe("csvCell", () => {
  it("leaves plain text alone", () => {
    expect(csvCell("Babynest")).toBe("Babynest");
    expect(csvCell("Åsa Öberg")).toBe("Åsa Öberg");
  });
  it("quotes semicolons, quotes and newlines", () => {
    expect(csvCell("a;b")).toBe('"a;b"');
    expect(csvCell('Säg "hej"')).toBe('"Säg ""hej"""');
    expect(csvCell("Rad 1\nRad 2")).toBe('"Rad 1\nRad 2"');
    expect(csvCell("Rad 1\r\nRad 2")).toBe('"Rad 1\r\nRad 2"');
  });
  it("neutralises formulas", () => {
    expect(csvCell("=HYPERLINK(\"x\")")).toBe('"\'=HYPERLINK(""x"")"');
    expect(csvCell("+46701234567")).toBe("'+46701234567");
    expect(csvCell("@foo")).toBe("'@foo");
  });
  it("formats other types", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
    expect(csvCell(300)).toBe("300");
    expect(csvCell(true)).toBe("yes");
    expect(csvCell(false)).toBe("no");
    expect(csvCell(new Date("2026-12-06T13:00:00Z"))).toBe("2026-12-06T13:00:00.000Z");
  });
});

describe("buildCsv", () => {
  it("starts with a BOM, uses semicolons and CRLF", () => {
    const csv = buildCsv(["a", "b"], [["x;y", 1], [null, "z"]]);
    expect(csv.startsWith(CSV_BOM)).toBe(true);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1)).toBe('a;b\r\n"x;y";1\r\n;z\r\n');
  });
});

describe("giftsCsv", () => {
  it("writes the header and one row per gift", () => {
    const csv = giftsCsv([
      {
        item: "Babynest",
        type: "item",
        guestName: "Anna Andersson",
        email: "anna@example.com",
        qty: 1,
        amount: null,
        status: "Purchased",
        message: "Grattis; kram!",
        address: "Storgatan 1\n111 22 Stockholm",
        showName: false,
        createdAt: new Date("2026-11-10T12:00:00Z"),
        thankedAt: null,
        thankNote: null,
      },
    ]);
    const lines = csv.slice(1).split("\r\n");
    expect(lines[0]).toBe(GIFT_CSV_HEADER.join(";"));
    expect(lines[0]).toBe("Item;Type;Name;Email;Qty;Amount (SEK);Status;Message;Address;Show name;Created;Thanked;Thank-you note");
    expect(csv).toContain(
      'Babynest;item;Anna Andersson;anna@example.com;1;;Purchased;"Grattis; kram!";"Storgatan 1\n111 22 Stockholm";no;2026-11-10T12:00:00.000Z;;',
    );
    expect(GIFT_CSV_HEADER).toHaveLength(13);
  });
});

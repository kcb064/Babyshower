import { describe, expect, it, vi } from "vitest";
import { checkLink, checkLinks, isDeadStatus, linkBadge, priceChanged } from "@/lib/linkcheck";
import type { FetchLike } from "@/lib/scrape";

const productPage = (price: string) =>
  `<html><head><meta property="og:title" content="Babynest"><meta property="product:price:amount" content="${price}"></head></html>`;

function mockFetch(routes: Record<string, () => Response | Promise<Response>>): FetchLike & ReturnType<typeof vi.fn> {
  return vi.fn(async (url: string) => {
    const route = routes[url];
    if (!route) throw new TypeError("fetch failed");
    return route();
  }) as unknown as FetchLike & ReturnType<typeof vi.fn>;
}

describe("priceChanged", () => {
  it("flags a difference of 5 % or more", () => {
    expect(priceChanged(1295, 1195)).toBe(true); // -7.7 %
    expect(priceChanged(1000, 1050)).toBe(true); // exactly 5 %
    expect(priceChanged(1000, 1049)).toBe(false);
    expect(priceChanged(1000, 960)).toBe(false);
    expect(priceChanged(null, 500)).toBe(false);
    expect(priceChanged(500, null)).toBe(false);
  });
});

describe("isDeadStatus", () => {
  it("treats 404/410/5xx as dead but not bot walls", () => {
    expect(isDeadStatus(404)).toBe(true);
    expect(isDeadStatus(410)).toBe(true);
    expect(isDeadStatus(503)).toBe(true);
    expect(isDeadStatus(403)).toBe(false);
    expect(isDeadStatus(429)).toBe(false);
  });
});

describe("checkLink", () => {
  it("ok when the page answers and the price matches", async () => {
    const fetchImpl = mockFetch({ "https://shop.example.se/ok": () => new Response(productPage("1295.00")) });
    const r = await checkLink({ id: 1, storeUrl: "https://shop.example.se/ok", price: 1295 }, { fetchImpl });
    expect(r).toEqual({ id: 1, status: "ok", scrapedPrice: 1295, httpStatus: 200 });
  });

  it("changed when the store price moved 5 % or more", async () => {
    const fetchImpl = mockFetch({ "https://shop.example.se/sale": () => new Response(productPage("1 195,00")) });
    const r = await checkLink({ id: 2, storeUrl: "https://shop.example.se/sale", price: 1295 }, { fetchImpl });
    expect(r.status).toBe("changed");
    expect(r.scrapedPrice).toBe(1195);
  });

  it("dead on 404, network error and timeout", async () => {
    const fetchImpl = mockFetch({
      "https://shop.example.se/gone": () => new Response("nope", { status: 404 }),
      "https://shop.example.se/slow": () => {
        const err = new Error("timed out");
        err.name = "TimeoutError";
        throw err;
      },
    });
    expect((await checkLink({ id: 3, storeUrl: "https://shop.example.se/gone", price: 100 }, { fetchImpl })).status).toBe("dead");
    expect((await checkLink({ id: 4, storeUrl: "https://shop.example.se/missing", price: 100 }, { fetchImpl })).status).toBe("dead");
    expect((await checkLink({ id: 5, storeUrl: "https://shop.example.se/slow", price: 100 }, { fetchImpl })).status).toBe("dead");
  });

  it("a bot wall (403) is not a dead link", async () => {
    const fetchImpl = mockFetch({ "https://shop.example.se/bot": () => new Response("", { status: 403 }) });
    const r = await checkLink({ id: 6, storeUrl: "https://shop.example.se/bot", price: 100 }, { fetchImpl });
    expect(r.status).toBe("ok");
    expect(r.scrapedPrice).toBeNull();
  });

  it("never fetches internal addresses", async () => {
    const fetchImpl = mockFetch({});
    const r = await checkLink({ id: 7, storeUrl: "http://127.0.0.1/admin", price: 100 }, { fetchImpl });
    expect(r.status).toBe("dead");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("passes an abort signal (8 s timeout) to fetch", async () => {
    const fetchImpl = mockFetch({ "https://shop.example.se/ok": () => new Response(productPage("10")) });
    await checkLink({ id: 1, storeUrl: "https://shop.example.se/ok", price: 10 }, { fetchImpl });
    const init = fetchImpl.mock.calls[0]![1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});

describe("checkLinks", () => {
  it("runs at most 5 at a time and keeps input order", async () => {
    let active = 0;
    let peak = 0;
    const fetchImpl = vi.fn(async (url: string) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return url.endsWith("/9") ? new Response("", { status: 404 }) : new Response(productPage("100"));
    }) as unknown as FetchLike;
    const targets = Array.from({ length: 12 }, (_, i) => ({ id: i, storeUrl: `https://shop.example.se/${i}`, price: 100 }));
    const results = await checkLinks(targets, { fetchImpl });
    expect(peak).toBe(5);
    expect(results.map((r) => r.id)).toEqual(targets.map((t) => t.id));
    expect(results[9]!.status).toBe("dead");
    expect(results.filter((r) => r.status === "ok")).toHaveLength(11);
  });

  it("handles an empty list", async () => {
    expect(await checkLinks([])).toEqual([]);
  });
});

describe("linkBadge", () => {
  it("red for dead, amber for a price change against the current price, nothing when ok", () => {
    expect(linkBadge({ linkStatus: "dead", price: 100, scrapedPrice: null })).toEqual({ kind: "dead" });
    expect(linkBadge({ linkStatus: "changed", price: 1295, scrapedPrice: 1195 })).toEqual({ kind: "price", scraped: 1195, price: 1295 });
    // The editor updated their price to match: the hint goes away.
    expect(linkBadge({ linkStatus: "changed", price: 1195, scrapedPrice: 1195 })).toBeNull();
    expect(linkBadge({ linkStatus: "ok", price: 100, scrapedPrice: 100 })).toBeNull();
    expect(linkBadge({ linkStatus: null, price: 100, scrapedPrice: null })).toBeNull();
  });
});

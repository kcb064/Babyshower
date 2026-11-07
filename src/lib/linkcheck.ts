/**
 * Dead-link and price check for store links. Re-fetches each page with the Phase 1 scraper,
 * 5 at a time with an 8 s timeout, and reports ok / dead / changed. It never changes the
 * editor's own price: a different store price is only shown as a hint.
 */
import type { LinkStatus } from "@/db/schema";
import { fetchHtml, isFetchableUrl, parseProductHtml, type FetchLike } from "./scrape";

export const LINKCHECK_CONCURRENCY = 5;
export const LINKCHECK_TIMEOUT_MS = 8000;
/** A store price this far (or more) from the editor's price counts as changed. */
export const PRICE_CHANGE_THRESHOLD = 0.05;
/** The admin button may run once per 10 minutes. */
export const LINKCHECK_COOLDOWN_MS = 10 * 60 * 1000;

export interface LinkCheckTarget {
  id: number;
  storeUrl: string;
  price: number | null;
}

export interface LinkCheckResult {
  id: number;
  status: LinkStatus;
  scrapedPrice: number | null;
  httpStatus: number | null;
}

/** True when the store price differs from the editor's price by 5 % or more. */
export function priceChanged(price: number | null | undefined, scraped: number | null | undefined): boolean {
  if (price === null || price === undefined || scraped === null || scraped === undefined) return false;
  if (price <= 0) return scraped > 0;
  return Math.abs(scraped - price) / price >= PRICE_CHANGE_THRESHOLD;
}

/**
 * HTTP statuses that mean the page is gone. Bot walls (401/403/429) are not treated as dead:
 * the page probably exists, we just cannot read it.
 */
export function isDeadStatus(status: number): boolean {
  return status === 404 || status === 410 || status >= 500;
}

export async function checkLink(
  target: LinkCheckTarget,
  opts: { fetchImpl?: FetchLike; timeoutMs?: number } = {},
): Promise<LinkCheckResult> {
  if (!isFetchableUrl(target.storeUrl)) return { id: target.id, status: "dead", scrapedPrice: null, httpStatus: null };
  const page = await fetchHtml(target.storeUrl, { fetchImpl: opts.fetchImpl, timeoutMs: opts.timeoutMs ?? LINKCHECK_TIMEOUT_MS });
  if (!page.ok) {
    const dead = page.status === null || isDeadStatus(page.status);
    return { id: target.id, status: dead ? "dead" : "ok", scrapedPrice: null, httpStatus: page.status };
  }
  const { price } = parseProductHtml(page.html, page.url);
  return {
    id: target.id,
    status: priceChanged(target.price, price) ? "changed" : "ok",
    scrapedPrice: price,
    httpStatus: page.status,
  };
}

/** Run checkLink over all targets with a small worker pool. Results keep the input order. */
export async function checkLinks(
  targets: readonly LinkCheckTarget[],
  opts: { fetchImpl?: FetchLike; timeoutMs?: number; concurrency?: number } = {},
): Promise<LinkCheckResult[]> {
  const results: LinkCheckResult[] = new Array(targets.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(opts.concurrency ?? LINKCHECK_CONCURRENCY, targets.length) }, async () => {
    while (next < targets.length) {
      const idx = next++;
      results[idx] = await checkLink(targets[idx]!, opts);
    }
  });
  await Promise.all(workers);
  return results;
}

export type LinkBadge = { kind: "dead" } | { kind: "price"; scraped: number; price: number } | null;

/** What the admin list shows for an item: red for a dead link, amber for a price change. */
export function linkBadge(it: { linkStatus: LinkStatus | null; price: number | null; scrapedPrice: number | null }): LinkBadge {
  if (it.linkStatus === "dead") return { kind: "dead" };
  if (it.price !== null && it.scrapedPrice !== null && priceChanged(it.price, it.scrapedPrice)) {
    return { kind: "price", scraped: it.scrapedPrice, price: it.price };
  }
  return null;
}

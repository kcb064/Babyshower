/** Parse a product page for title, image and price (Open Graph, schema.org JSON-LD, microdata). */

export interface ScrapedProduct {
  title: string | null;
  imageUrl: string | null;
  /** Whole SEK, when the page states a price. */
  price: number | null;
  currency: string | null;
  description: string | null;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function decodeEntities(input: string): string {
  return input.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === "#") {
      const n = code[1]?.toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[code.toLowerCase()] ?? m;
  });
}

function parseAttributes(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([^\s"'<>\/=]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tag))) {
    const name = m[1]!.toLowerCase();
    if (!(name in attrs)) attrs[name] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? "");
  }
  return attrs;
}

/** Parse "1 295,00", "1295.00", "1,295.00", "SEK 499" etc. into whole kronor. */
export function parsePrice(input: unknown): number | null {
  if (typeof input === "number") return Number.isFinite(input) && input >= 0 ? Math.round(input) : null;
  if (typeof input !== "string") return null;
  let s = input.replace(/[\s  ]/g, "").replace(/[^\d.,]/g, "");
  if (!/\d/.test(s)) return null;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > -1 && lastDot > -1) {
    // Whichever comes last is the decimal separator.
    if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (lastComma > -1) {
    const decimals = s.length - lastComma - 1;
    s = decimals === 3 && s.indexOf(",") === lastComma ? s.replace(",", "") : s.replace(/,/g, ".");
  } else if (lastDot > -1) {
    const decimals = s.length - lastDot - 1;
    if (decimals === 3 && s.indexOf(".") === lastDot) s = s.replace(".", "");
  }
  const parts = s.split(".");
  if (parts.length > 2) s = parts.slice(0, -1).join("") + "." + parts[parts.length - 1];
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function resolveUrl(value: string | null | undefined, base: string): string | null {
  if (!value) return null;
  try {
    const u = new URL(value.trim(), base);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

function hasType(node: Record<string, unknown>, type: string): boolean {
  const t = node["@type"];
  if (typeof t === "string") return t.toLowerCase() === type.toLowerCase() || t.toLowerCase().endsWith("/" + type.toLowerCase());
  if (Array.isArray(t)) return t.some((x) => typeof x === "string" && x.toLowerCase() === type.toLowerCase());
  return false;
}

function findProducts(node: unknown, out: Record<string, unknown>[], depth = 0) {
  if (depth > 8 || node === null || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const n of node) findProducts(n, out, depth + 1);
    return;
  }
  const obj = node as Record<string, unknown>;
  if (hasType(obj, "Product")) out.push(obj);
  if (obj["@graph"]) findProducts(obj["@graph"], out, depth + 1);
  if (obj.mainEntity) findProducts(obj.mainEntity, out, depth + 1);
}

function firstString(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    for (const v of value) {
      const s = firstString(v);
      if (s) return s;
    }
    return null;
  }
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    return firstString(o.url ?? o.contentUrl ?? o["@id"]);
  }
  return null;
}

function offerPrice(offers: unknown): { price: number | null; currency: string | null } {
  const list = Array.isArray(offers) ? offers : offers ? [offers] : [];
  for (const raw of list) {
    if (!raw || typeof raw !== "object") continue;
    const o = raw as Record<string, unknown>;
    const spec = Array.isArray(o.priceSpecification) ? o.priceSpecification[0] : o.priceSpecification;
    const specObj = spec && typeof spec === "object" ? (spec as Record<string, unknown>) : {};
    const price = parsePrice(o.price ?? o.lowPrice ?? specObj.price);
    const currency = (o.priceCurrency ?? specObj.priceCurrency) as string | undefined;
    if (price !== null) return { price, currency: typeof currency === "string" ? currency : null };
    if (o.offers) {
      const nested = offerPrice(o.offers);
      if (nested.price !== null) return nested;
    }
  }
  return { price: null, currency: null };
}

export function parseProductHtml(html: string, pageUrl: string): ScrapedProduct {
  const meta = new Map<string, string>();
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = parseAttributes(m[0]);
    const key = (attrs.property ?? attrs.name ?? attrs.itemprop ?? "").toLowerCase();
    const content = attrs.content;
    if (key && content !== undefined && !meta.has(key)) meta.set(key, content.trim());
  }

  const products: Record<string, unknown>[] = [];
  for (const m of html.matchAll(/<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      findProducts(JSON.parse(m[1]!.trim()), products);
    } catch {
      // Ignore malformed JSON-LD blocks.
    }
  }
  const product = products[0];

  let title: string | null = null;
  let imageUrl: string | null = null;
  let price: number | null = null;
  let currency: string | null = null;
  let description: string | null = null;

  if (product) {
    title = typeof product.name === "string" ? decodeEntities(product.name).trim() : null;
    imageUrl = resolveUrl(firstString(product.image), pageUrl);
    description = typeof product.description === "string" ? decodeEntities(product.description).trim() : null;
    ({ price, currency } = offerPrice(product.offers));
  }

  title ??= meta.get("og:title") ?? meta.get("twitter:title") ?? null;
  if (!title) {
    const t = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
    title = t ? decodeEntities(t[1]!).replace(/\s+/g, " ").trim() || null : null;
  }
  imageUrl ??= resolveUrl(meta.get("og:image:secure_url") ?? meta.get("og:image") ?? meta.get("twitter:image") ?? meta.get("image"), pageUrl);
  if (price === null) {
    price = parsePrice(meta.get("product:price:amount") ?? meta.get("og:price:amount") ?? meta.get("price"));
    currency = meta.get("product:price:currency") ?? meta.get("og:price:currency") ?? meta.get("pricecurrency") ?? null;
  }
  if (price === null) {
    // Microdata on a non-meta element, e.g. <span itemprop="price" content="499">.
    const m = /<[^>]+itemprop\s*=\s*["']price["'][^>]*>/i.exec(html);
    if (m) price = parsePrice(parseAttributes(m[0]).content);
  }
  description ??= meta.get("og:description") ?? meta.get("description") ?? null;

  return { title, imageUrl, price, currency, description };
}

/** Very small SSRF guard: editors only, but still refuse obvious internal targets. */
export function isFetchableUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) return false;
  if (/^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) return false;
  if (host.includes(":")) return false; // IPv6 literals: not needed for store links
  if (!host.includes(".")) return false;
  return true;
}

export const MAX_HTML_BYTES = 3 * 1024 * 1024;

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type FetchHtmlResult =
  | { ok: true; status: number; url: string; html: string }
  | { ok: false; status: number | null; error: "http" | "network" | "timeout" };

/** GET a store page (8 s timeout, 3 MB cap). Never throws. */
export async function fetchHtml(
  url: string,
  opts: { fetchImpl?: FetchLike; timeoutMs?: number } = {},
): Promise<FetchHtmlResult> {
  const doFetch = opts.fetchImpl ?? fetch;
  try {
    const res = await doFetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(opts.timeoutMs ?? 8000),
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; BabyshowerRegistry/1.0; +link preview)",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "sv-SE,sv;q=0.9,en;q=0.8",
      },
    });
    if (!res.ok) {
      await res.body?.cancel().catch(() => {});
      return { ok: false, status: res.status, error: "http" };
    }
    if (!res.body) return { ok: true, status: res.status, url: res.url || url, html: "" };
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (total < MAX_HTML_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.byteLength;
    }
    await reader.cancel().catch(() => {});
    return { ok: true, status: res.status, url: res.url || url, html: new TextDecoder().decode(Buffer.concat(chunks)) };
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    return { ok: false, status: null, error: name === "TimeoutError" || name === "AbortError" ? "timeout" : "network" };
  }
}

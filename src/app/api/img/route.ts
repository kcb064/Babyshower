import fs from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { item } from "@/db/schema";
import { serverEnv } from "@/lib/env";
import { IMG_CACHE_SECONDS, IMG_FETCH_TIMEOUT_MS, IMG_MAX_BYTES, imageCacheKey, isImageContentType, validateImageUrl } from "@/lib/imgproxy";

export const dynamic = "force-dynamic";

const notFound = () => new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });

function imageResponse(body: Uint8Array, type: string): Response {
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": type,
      "Content-Length": String(body.byteLength),
      "Cache-Control": `public, max-age=${IMG_CACHE_SECONDS}`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}

async function readCapped(res: Response): Promise<Uint8Array | null> {
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > IMG_MAX_BYTES) return null;
  if (!res.body) return null;
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > IMG_MAX_BYTES) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  return new Uint8Array(Buffer.concat(chunks));
}

/**
 * GET /api/img?u=<url>: serve an item's external image from DATA_DIR/imgcache, fetching it once.
 * Only URLs that are some item's imageUrl are proxied, so this is not an open proxy.
 */
export async function GET(req: Request) {
  const url = validateImageUrl(new URL(req.url).searchParams.get("u"));
  if (!url) return notFound();
  const raw = new URL(req.url).searchParams.get("u")!;
  const db = getDb();
  const known =
    db.select({ id: item.id }).from(item).where(eq(item.imageUrl, raw)).get() ??
    (raw !== url ? db.select({ id: item.id }).from(item).where(eq(item.imageUrl, url)).get() : undefined);
  if (!known) return notFound();

  const dir = path.join(serverEnv().dataDir, "imgcache");
  const key = imageCacheKey(url);
  const dataFile = path.join(dir, `${key}.bin`);
  const typeFile = path.join(dir, `${key}.type`);
  try {
    const [data, type] = await Promise.all([fs.readFile(dataFile), fs.readFile(typeFile, "utf8")]);
    if (isImageContentType(type)) return imageResponse(data, type.trim());
  } catch {
    // Not cached yet.
  }

  let res: Response;
  try {
    res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(IMG_FETCH_TIMEOUT_MS),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; BabyshowerRegistry/1.0; image proxy)", Accept: "image/*" },
    });
  } catch {
    return new Response("Bad gateway", { status: 502, headers: { "Cache-Control": "no-store" } });
  }
  const type = res.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
  if (!res.ok || !isImageContentType(type)) {
    await res.body?.cancel().catch(() => {});
    return new Response("Bad gateway", { status: 502, headers: { "Cache-Control": "no-store" } });
  }
  const body = await readCapped(res).catch(() => null);
  if (!body) return new Response("Too large", { status: 502, headers: { "Cache-Control": "no-store" } });
  try {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(`${dataFile}.tmp`, body);
    await fs.rename(`${dataFile}.tmp`, dataFile);
    await fs.writeFile(typeFile, type);
  } catch (err) {
    console.warn("[img] cache write failed:", err instanceof Error ? err.message : err);
  }
  return imageResponse(body, type);
}

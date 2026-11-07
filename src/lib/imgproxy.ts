/** Helpers for /api/img: external item images are fetched once and served from DATA_DIR/imgcache. */
import { createHash } from "node:crypto";
import { isFetchableUrl } from "./scrape";

export const IMG_MAX_BYTES = 5 * 1024 * 1024;
export const IMG_CACHE_SECONDS = 7 * 24 * 60 * 60;
export const IMG_FETCH_TIMEOUT_MS = 8000;

/** Accept only absolute http(s) URLs that are not obviously internal. Returns the normalised URL. */
export function validateImageUrl(raw: string | null | undefined): string | null {
  if (!raw || raw.length > 2000) return null;
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  if (u.username || u.password) return null;
  const href = u.toString();
  return isFetchableUrl(href) ? href : null;
}

/** Cache file name: sha256 of the normalised URL, hex. */
export function imageCacheKey(url: string): string {
  return createHash("sha256").update(url).digest("hex");
}

export function isImageContentType(value: string | null | undefined): boolean {
  if (!value) return false;
  const type = value.split(";")[0]!.trim().toLowerCase();
  // SVG can carry script; item photos are never SVG.
  return /^image\/[a-z0-9.+-]+$/.test(type) && type !== "image/svg+xml";
}

export { proxiedImageSrc } from "./imgsrc";

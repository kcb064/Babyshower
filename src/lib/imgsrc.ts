/** Public cards: external images go through the /api/img proxy, uploads keep their own route. */
export function proxiedImageSrc(src: string | null | undefined): string | null {
  if (!src) return null;
  if (/^https?:\/\//i.test(src)) return `/api/img?u=${encodeURIComponent(src)}`;
  return src;
}

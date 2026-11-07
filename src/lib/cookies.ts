import { headers } from "next/headers";

/**
 * Decide from request headers whether the browser reached us over HTTPS. Behind Cloudflare Tunnel
 * the container sees plain HTTP but Cloudflare sets X-Forwarded-Proto: https (and cf-visitor).
 * A direct visit to http://<host>:3000 must NOT get Secure cookies, or the browser drops them
 * and sign-in loops back to the passcode page.
 */
export function httpsFromHeaders(get: (name: string) => string | null | undefined): boolean {
  const proto = get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  if (proto) return proto === "https";
  const cfVisitor = get("cf-visitor");
  if (cfVisitor && /"scheme"\s*:\s*"https"/.test(cfVisitor)) return true;
  return false;
}

/** Secure flag for a cookie set during the current request. */
export async function secureCookieFlag(): Promise<boolean> {
  const h = await headers();
  return httpsFromHeaders((name) => h.get(name));
}

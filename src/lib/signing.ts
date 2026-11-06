/**
 * HMAC-SHA256 signed tokens: `base64url(json).base64url(signature)`.
 * Uses Web Crypto so it runs in Node, the Edge runtime and Vitest alike.
 */

const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(input: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(input)) return null;
  const padded = input.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((input.length + 3) % 4);
  try {
    const binary = atob(padded);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  if (!secret) throw new Error("Cookie secret is empty");
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

export type SignedPayload = Record<string, unknown> & { exp?: number };

/** Sign a JSON payload. `maxAgeSeconds` adds an `exp` claim (unix seconds). */
export async function signToken(
  payload: Record<string, unknown>,
  secret: string,
  maxAgeSeconds?: number,
  now: number = Date.now(),
): Promise<string> {
  const body: SignedPayload = { ...payload };
  if (maxAgeSeconds !== undefined) body.exp = Math.floor(now / 1000) + maxAgeSeconds;
  const data = toBase64Url(encoder.encode(JSON.stringify(body)));
  const key = await hmacKey(secret);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(data)));
  return `${data}.${toBase64Url(sig)}`;
}

/** Verify a token; returns the payload or null if tampered, malformed or expired. */
export async function verifyToken<T extends SignedPayload = SignedPayload>(
  token: string | null | undefined,
  secret: string,
  now: number = Date.now(),
): Promise<T | null> {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [data, sigPart] = parts as [string, string];
  const sig = fromBase64Url(sigPart);
  if (!sig) return null;
  const key = await hmacKey(secret);
  const ok = await crypto.subtle.verify("HMAC", key, sig as BufferSource, encoder.encode(data));
  if (!ok) return null;
  const raw = fromBase64Url(data);
  if (!raw) return null;
  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    return null;
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const p = payload as T;
  if (typeof p.exp === "number" && p.exp * 1000 <= now) return null;
  return p;
}

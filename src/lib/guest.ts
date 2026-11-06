import { cookies, headers } from "next/headers";
import { randomBytes } from "node:crypto";
import { serverEnv } from "./env";
import { signToken, verifyToken } from "./signing";

export const GUEST_COOKIE = "bs_guest";
const GUEST_MAX_AGE = 365 * 24 * 60 * 60;

export interface GuestIdentity {
  gid: string;
  email: string;
}

export function newGuestId(): string {
  return randomBytes(16).toString("base64url");
}

function parseGuest(p: Record<string, unknown> | null, kind: string): GuestIdentity | null {
  if (!p || p.kind !== kind || typeof p.gid !== "string" || typeof p.email !== "string") return null;
  return { gid: p.gid, email: p.email };
}

export async function getGuest(): Promise<GuestIdentity | null> {
  const token = (await cookies()).get(GUEST_COOKIE)?.value;
  return parseGuest(await verifyToken(token, serverEnv().cookieSecret), "guest");
}

export async function setGuestCookie(guest: GuestIdentity) {
  const env = serverEnv();
  const token = await signToken({ kind: "guest", ...guest }, env.cookieSecret, GUEST_MAX_AGE);
  (await cookies()).set(GUEST_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.secureCookies,
    path: "/",
    maxAge: GUEST_MAX_AGE,
  });
}

/** Durable token for the "my claims" link a guest can open on another device. */
export async function guestLinkToken(guest: GuestIdentity): Promise<string> {
  return signToken({ kind: "guest-link", ...guest }, serverEnv().cookieSecret);
}

export async function readGuestLinkToken(token: string | null | undefined): Promise<GuestIdentity | null> {
  return parseGuest(await verifyToken(token, serverEnv().cookieSecret), "guest-link");
}

/** Absolute base URL: PUBLIC_URL if set, else derived from the request headers. */
export async function baseUrl(): Promise<string> {
  const env = serverEnv();
  if (env.publicUrl) return env.publicUrl;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  return (
    h.get("cf-connecting-ip") ??
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    h.get("x-real-ip") ??
    "unknown"
  );
}

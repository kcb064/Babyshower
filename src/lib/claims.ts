/** Pure claim rules: availability, expiry and what each audience is allowed to see. */

export const RESERVE_HOURS = 72;
export const RESERVE_MS = RESERVE_HOURS * 60 * 60 * 1000;

export type ClaimStatus = "reserved" | "purchased" | "released";

export interface ClaimLike {
  qty: number;
  status: ClaimStatus;
  expiresAt: Date | null;
  showName?: boolean;
  guestName?: string;
}

/** A reserved claim whose 72 h hold has run out counts as released. */
export function isExpired(claim: Pick<ClaimLike, "status" | "expiresAt">, now: Date): boolean {
  return claim.status === "reserved" && claim.expiresAt !== null && claim.expiresAt.getTime() <= now.getTime();
}

export function effectiveStatus(claim: Pick<ClaimLike, "status" | "expiresAt">, now: Date): ClaimStatus {
  return isExpired(claim, now) ? "released" : claim.status;
}

export function reservationExpiry(now: Date): Date {
  return new Date(now.getTime() + RESERVE_MS);
}

export interface Availability {
  total: number;
  reserved: number;
  purchased: number;
  /** reserved + purchased */
  claimed: number;
  remaining: number;
}

export function availability(qtyWanted: number, claims: readonly ClaimLike[], now: Date): Availability {
  let reserved = 0;
  let purchased = 0;
  for (const c of claims) {
    const s = effectiveStatus(c, now);
    if (s === "reserved") reserved += c.qty;
    else if (s === "purchased") purchased += c.qty;
  }
  const claimed = reserved + purchased;
  return { total: qtyWanted, reserved, purchased, claimed, remaining: Math.max(0, qtyWanted - claimed) };
}

/** Validate a requested claim quantity against what is left. */
export function checkClaimQty(qty: number, remaining: number): { ok: true } | { ok: false; reason: "invalid" | "unavailable" } {
  if (!Number.isInteger(qty) || qty < 1) return { ok: false, reason: "invalid" };
  if (remaining < 1 || qty > remaining) return { ok: false, reason: "unavailable" };
  return { ok: true };
}

/** What other guests see: counts plus names only of guests who opted in. */
export interface PublicItemStatus extends Availability {
  names: string[];
}

export function publicStatus(qtyWanted: number, claims: readonly ClaimLike[], now: Date): PublicItemStatus {
  const names: string[] = [];
  for (const c of claims) {
    const s = effectiveStatus(c, now);
    if (s === "released") continue;
    const name = c.showName ? c.guestName?.trim().split(/\s+/)[0] : undefined;
    if (name && !names.includes(name)) names.push(name);
  }
  return { ...availability(qtyWanted, claims, now), names };
}

export interface AdminClaimDetail {
  guestName: string;
  guestEmail: string;
  qty: number;
  status: ClaimStatus;
  message: string | null;
  address: string | null;
}

export interface AdminItemAggregate {
  total: number;
  qtyClaimed: number;
  qtyPurchased: number;
  remaining: number;
  /** Per-claim details; null while surprise mode is on (registry not revealed). */
  details: AdminClaimDetail[] | null;
}

export type AdminClaimInput = ClaimLike & {
  guestName: string;
  guestEmail: string;
  message: string | null;
  address: string | null;
};

/**
 * Editor view of one item. Until the registry is revealed only aggregate numbers leave this
 * function: no names, emails, messages or per-claim purchase status.
 */
export function adminAggregate(
  qtyWanted: number,
  claims: readonly AdminClaimInput[],
  revealed: boolean,
  now: Date,
): AdminItemAggregate {
  const a = availability(qtyWanted, claims, now);
  const base = { total: a.total, qtyClaimed: a.claimed, qtyPurchased: a.purchased, remaining: a.remaining };
  if (!revealed) return { ...base, details: null };
  return {
    ...base,
    details: claims
      .filter((c) => effectiveStatus(c, now) !== "released")
      .map((c) => ({
        guestName: c.guestName,
        guestEmail: c.guestEmail,
        qty: c.qty,
        status: effectiveStatus(c, now),
        message: c.message,
        address: c.address,
      })),
  };
}

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

/* ---------- Group gifts and cash funds ---------- */

/** A self-reported contribution that has not been confirmed ("I've sent it") within 24 h is dropped. */
export const CONTRIBUTION_CONFIRM_HOURS = 24;
export const CONTRIBUTION_CONFIRM_MS = CONTRIBUTION_CONFIRM_HOURS * 60 * 60 * 1000;
export const MIN_CONTRIBUTION = 20;
export const MAX_CONTRIBUTION = 100_000;
export const CONTRIBUTION_PRESETS = [200, 300, 500, 1000] as const;

export interface ContributionLike {
  qty: number;
  status: ClaimStatus;
  expiresAt: Date | null;
  /** Set for fund / group contributions; null for a "buy the whole thing" claim. */
  amount: number | null;
  confirmedAt: Date | null;
  createdAt: Date;
  showName?: boolean;
  guestName?: string;
}

export function contributionExpiry(now: Date): Date {
  return new Date(now.getTime() + CONTRIBUTION_CONFIRM_MS);
}

export function isContribution(c: Pick<ContributionLike, "amount">): boolean {
  return c.amount !== null;
}

/** Unconfirmed and still inside the 24 h window. */
export function isPendingContribution(c: ContributionLike, now: Date): boolean {
  return (
    c.amount !== null &&
    c.status !== "released" &&
    c.confirmedAt === null &&
    now.getTime() - c.createdAt.getTime() < CONTRIBUTION_CONFIRM_MS
  );
}

export function isConfirmedContribution(c: ContributionLike): boolean {
  return c.amount !== null && c.status !== "released" && c.confirmedAt !== null;
}

export interface FundTotals {
  goal: number;
  /** Sum of confirmed contributions in SEK. */
  confirmed: number;
  /** Number of confirmed contributions. */
  contributors: number;
  /** Unconfirmed contributions younger than 24 h. */
  pending: number;
  /** 0–100, whole percent. 100 when a guest is buying the whole gift. */
  percent: number;
  /** A guest reserved or bought the whole group gift. */
  boughtWhole: boolean;
  /** Goal reached, or bought whole. */
  covered: boolean;
  /** First names of confirmed contributors who opted in to showing their name. */
  names: string[];
}

/**
 * Progress for a group gift or cash fund. Only confirmed contributions count; unconfirmed ones
 * older than 24 h are ignored entirely (lazily released by the query layer, like reservations).
 */
export function fundTotals(goal: number | null, claims: readonly ContributionLike[], now: Date): FundTotals {
  const g = goal && goal > 0 ? goal : 0;
  let confirmed = 0;
  let contributors = 0;
  let pending = 0;
  let boughtWhole = false;
  const names: string[] = [];
  for (const c of claims) {
    if (c.amount === null) {
      if (effectiveStatus(c, now) !== "released") boughtWhole = true;
      continue;
    }
    if (isConfirmedContribution(c)) {
      confirmed += c.amount;
      contributors += 1;
      const name = c.showName ? c.guestName?.trim().split(/\s+/)[0] : undefined;
      if (name && !names.includes(name)) names.push(name);
    } else if (isPendingContribution(c, now)) {
      pending += 1;
    }
  }
  const percent = boughtWhole ? 100 : g > 0 ? Math.min(100, Math.floor((confirmed / g) * 100)) : 0;
  return { goal: g, confirmed, contributors, pending, percent, boughtWhole, covered: boughtWhole || (g > 0 && confirmed >= g), names };
}

/**
 * Whether a guest may still take the "buy the whole gift" path on a group gift: nobody has bought
 * it whole and nobody has started contributing (confirmed or pending).
 */
export function canBuyWhole(totals: FundTotals): boolean {
  return !totals.boughtWhole && totals.contributors === 0 && totals.pending === 0;
}

/** Whether a new contribution is accepted. Funds stay open past the goal; group gifts close when covered. */
export function canContribute(type: "group" | "fund", totals: FundTotals): boolean {
  if (totals.boughtWhole) return false;
  return type === "fund" || !totals.covered;
}

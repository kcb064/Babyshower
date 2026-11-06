/** Swish (Swedish mobile payments) helpers: number validation and the app deep-link payload. */

export const SWISH_MESSAGE_MAX = 50;

/**
 * Normalise a Swish number as typed by an editor: strip spaces, dashes, dots and brackets, and
 * turn an international prefix (+46 / 0046 / 46 followed by 7) into a leading 0.
 * Returns the digits only, or null when nothing digit-like remains.
 */
export function normalizeSwishNumber(input: string | null | undefined): string | null {
  if (!input) return null;
  let v = input.trim().replace(/[\s\-.()/]/g, "");
  if (v === "") return null;
  if (v.startsWith("+46")) v = `0${v.slice(3)}`;
  else if (v.startsWith("0046")) v = `0${v.slice(4)}`;
  else if (/^467\d{8}$/.test(v)) v = `0${v.slice(2)}`;
  // A stray 0 after the country code: +46 (0)70… → 0070…
  if (/^007\d{8}$/.test(v)) v = v.slice(1);
  return /^\d+$/.test(v) ? v : null;
}

/** Swedish mobile number (07x, 10 digits) or a Swish company number (123 + 7 digits). */
export function isValidSwishNumber(digits: string): boolean {
  return /^07\d{8}$/.test(digits) || /^123\d{7}$/.test(digits);
}

export type SwishNumberResult = { ok: true; value: string | null } | { ok: false };

/** Validate an optional Swish number from the settings form. Empty is allowed (Swish off). */
export function parseSwishNumber(input: string | null | undefined): SwishNumberResult {
  if (input === null || input === undefined || input.trim() === "") return { ok: true, value: null };
  const digits = normalizeSwishNumber(input);
  if (!digits || !isValidSwishNumber(digits)) return { ok: false };
  return { ok: true, value: digits };
}

/** "070-123 45 67" / "123 456 78 90" for display. */
export function formatSwishNumber(digits: string): string {
  if (/^07\d{8}$/.test(digits)) return `${digits.slice(0, 3)}-${digits.slice(3, 6)} ${digits.slice(6, 8)} ${digits.slice(8)}`;
  if (/^123\d{7}$/.test(digits)) return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 8)} ${digits.slice(8)}`;
  return digits;
}

/** Whole kronor, at least 1. Throws on anything that is not a finite positive number. */
export function normalizeAmount(amount: number): number {
  if (typeof amount !== "number" || !Number.isFinite(amount)) throw new Error("Swish amount must be a number");
  const whole = Math.round(amount);
  if (whole < 1) throw new Error("Swish amount must be at least 1 kr");
  return whole;
}

/** Trim and cut the message to Swish's 50-character limit (by code point, not UTF-16 unit). */
export function truncateMessage(message: string): string {
  const chars = Array.from(message.replace(/\s+/g, " ").trim());
  return chars.slice(0, SWISH_MESSAGE_MAX).join("").trim();
}

export interface SwishPayload {
  version: 1;
  payee: { value: string; editable: false };
  amount: { value: number; editable: false };
  message: { value: string; editable: true };
}

export function buildSwishPayload(opts: { payee: string | null | undefined; amount: number; message: string }): SwishPayload {
  const payee = normalizeSwishNumber(opts.payee ?? "");
  if (!payee) throw new Error("Swish payee is missing");
  return {
    version: 1,
    payee: { value: payee, editable: false },
    amount: { value: normalizeAmount(opts.amount), editable: false },
    message: { value: truncateMessage(opts.message), editable: true },
  };
}

/** `swish://payment?data=<url-encoded JSON>` — opens the Swish app with payee and amount locked. */
export function buildSwishUrl(opts: { payee: string | null | undefined; amount: number; message: string }): string {
  return `swish://payment?data=${encodeURIComponent(JSON.stringify(buildSwishPayload(opts)))}`;
}

/** Short default Swish message, e.g. "Babyshower: Blöjfond". */
export function swishMessage(itemName: string, locale: "sv" | "en"): string {
  return truncateMessage(`${locale === "sv" ? "Babyshower" : "Baby shower"}: ${itemName}`);
}

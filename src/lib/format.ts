import type { Locale } from "./i18n";

const NBSP = " ";

/** Format whole kronor Swedish style: `1 295 kr` with non-breaking spaces. */
export function formatSEK(amount: number): string {
  const rounded = Math.round(amount);
  const sign = rounded < 0 ? "-" : "";
  const digits = Math.abs(rounded).toString();
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  return `${sign}${grouped}${NBSP}kr`;
}

const intlLocale: Record<Locale, string> = { sv: "sv-SE", en: "en-GB" };

/** Format a calendar date (YYYY-MM-DD) in the active locale, without timezone drift. */
export function formatEventDate(date: string, locale: Locale): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return date;
  const d = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return new Intl.DateTimeFormat(intlLocale[locale], {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
}

/** Event date plus time, e.g. "söndag 6 december 2026 kl. 14:00" / "Sunday 6 December 2026 at 14:00". */
export function formatEventDateTime(date: string, time: string | null | undefined, locale: Locale): string {
  const day = formatEventDate(date, locale);
  if (!time) return day;
  return locale === "sv" ? `${day} kl. ${time}` : `${day} at ${time}`;
}

/** Format a timestamp (e.g. claim expiry or editor log) in Swedish time. */
export function formatDateTime(value: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(intlLocale[locale], {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Stockholm",
  }).format(value);
}

/** "för 5 minuter sedan" / "5 minutes ago"; falls back to an absolute time after a week. */
export function formatRelative(value: Date, now: Date, locale: Locale): string {
  const diffSec = Math.round((value.getTime() - now.getTime()) / 1000);
  const abs = Math.abs(diffSec);
  if (abs >= 7 * 24 * 3600) return formatDateTime(value, locale);
  const rtf = new Intl.RelativeTimeFormat(intlLocale[locale], { numeric: "auto" });
  if (abs < 45) return rtf.format(0, "second");
  if (abs < 45 * 60) return rtf.format(Math.round(diffSec / 60), "minute");
  if (abs < 22 * 3600) return rtf.format(Math.round(diffSec / 3600), "hour");
  return rtf.format(Math.round(diffSec / 86400), "day");
}

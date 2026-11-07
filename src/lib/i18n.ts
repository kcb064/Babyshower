export const locales = ["sv", "en"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";
export const LOCALE_COOKIE = "NEXT_LOCALE";

/** Bilingual text as stored in the database. At least one half is filled; the other falls back to it. */
export type Bilingual = { sv?: string | null; en?: string | null };

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}

export function normalizeLocale(value: unknown): Locale {
  return isLocale(value) ? value : defaultLocale;
}

const filled = (v: string | null | undefined) => typeof v === "string" && v.trim() !== "";

/** Pick the text for the active locale, falling back to the other language when it is blank. */
export function t2(field: Bilingual | null | undefined, locale: Locale): string {
  if (!field) return "";
  if (filled(field[locale])) return field[locale] as string;
  const other = locale === "en" ? field.sv : field.en;
  return filled(other) ? (other as string) : "";
}

/** True when at least one language is filled in. */
export function hasText(field: Bilingual | null | undefined): boolean {
  return !!field && (filled(field.sv) || filled(field.en));
}

/** Build a Bilingual value from form input, trimming and dropping empty halves. */
export function bilingual(sv?: string | null, en?: string | null): Bilingual {
  const out: Bilingual = {};
  const svTrim = (sv ?? "").trim();
  const enTrim = (en ?? "").trim();
  if (svTrim) out.sv = svTrim;
  if (enTrim) out.en = enTrim;
  return out;
}

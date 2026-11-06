export const locales = ["sv", "en"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "sv";
export const LOCALE_COOKIE = "NEXT_LOCALE";

/** Bilingual text as stored in the database. Swedish is the required half. */
export type Bilingual = { sv: string; en?: string | null };

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}

export function normalizeLocale(value: unknown): Locale {
  return isLocale(value) ? value : defaultLocale;
}

/** Pick the text for the active locale, falling back to Swedish when the translation is blank. */
export function t2(field: Bilingual | null | undefined, locale: Locale): string {
  if (!field) return "";
  const value = field[locale];
  if (typeof value === "string" && value.trim() !== "") return value;
  return field.sv ?? "";
}

/** Build a Bilingual value from form input, trimming and dropping an empty English half. */
export function bilingual(sv: string, en?: string | null): Bilingual {
  const enTrim = (en ?? "").trim();
  return enTrim ? { sv: sv.trim(), en: enTrim } : { sv: sv.trim() };
}

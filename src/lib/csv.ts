/**
 * CSV for Excel (incl. Swedish locale): UTF-8 with BOM (so non-ASCII letters survive on Windows), semicolon separator,
 * CRLF line endings, ISO dates.
 */

export const CSV_BOM = "﻿";
export const CSV_SEPARATOR = ";";

export type CsvCell = string | number | boolean | Date | null | undefined;

/** Quote a cell when needed and neutralise spreadsheet formulas in free text. */
export function csvCell(value: CsvCell): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "boolean") return value ? "yes" : "no";
  let s = value;
  // Guest-typed text starting with = + - @ would run as a formula in Excel: prefix an apostrophe.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[";\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function buildCsv(header: readonly string[], rows: readonly (readonly CsvCell[])[]): string {
  const lines = [header, ...rows].map((r) => r.map(csvCell).join(CSV_SEPARATOR));
  return CSV_BOM + lines.join("\r\n") + "\r\n";
}

export interface GiftCsvRow {
  item: string;
  type: string;
  guestName: string;
  email: string;
  qty: number | null;
  amount: number | null;
  status: string;
  message: string | null;
  address: string | null;
  showName: boolean;
  createdAt: Date;
  thankedAt: Date | null;
  thankNote: string | null;
}

export const GIFT_CSV_HEADER = [
  "Item",
  "Type",
  "Name",
  "Email",
  "Qty",
  "Amount (SEK)",
  "Status",
  "Message",
  "Address",
  "Show name",
  "Created",
  "Thanked",
  "Thank-you note",
] as const;

export function giftsCsv(rows: readonly GiftCsvRow[]): string {
  return buildCsv(
    GIFT_CSV_HEADER,
    rows.map((r) => [
      r.item,
      r.type,
      r.guestName,
      r.email,
      r.qty,
      r.amount,
      r.status,
      r.message,
      r.address,
      r.showName,
      r.createdAt,
      r.thankedAt,
      r.thankNote,
    ]),
  );
}

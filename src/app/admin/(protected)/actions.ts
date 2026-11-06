"use server";

import { asc, eq, max } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb, type DB } from "@/db";
import { logEdit } from "@/db/queries";
import { category, item, registry } from "@/db/schema";
import { requireEditor } from "@/lib/auth";
import { serverEnv } from "@/lib/env";
import { bilingual, t2 } from "@/lib/i18n";
import { isFetchableUrl, parseProductHtml, type ScrapedProduct } from "@/lib/scrape";
import { saveImageUpload } from "@/lib/uploads";
import { categorySchema, formToObject, itemSchema, registrySchema } from "@/lib/validation";

export interface FormState {
  ok?: boolean;
  error?: "invalid" | "image";
  at?: number;
}

function refresh() {
  revalidatePath("/admin", "layout");
  revalidatePath("/");
}

function idFrom(formData: FormData): number | null {
  const id = Number(formData.get("id"));
  return Number.isInteger(id) && id > 0 ? id : null;
}

/* ---------- Registry ---------- */

export async function updateRegistry(_prev: FormState, formData: FormData): Promise<FormState> {
  const editor = await requireEditor();
  const parsed = registrySchema.safeParse(formToObject(formData));
  if (!parsed.success) return { error: "invalid", at: Date.now() };
  const d = parsed.data;
  const db = getDb();
  db.update(registry)
    .set({
      title: bilingual(d.titleSv, d.titleEn),
      welcome: bilingual(d.welcomeSv, d.welcomeEn),
      eventDate: d.eventDate,
      eventTime: d.eventTime,
      location: d.location,
      mapUrl: d.mapUrl,
      hostContact: d.hostContact,
      swishNumber: d.swishNumber,
      updatedAt: new Date(),
    })
    .where(eq(registry.id, 1))
    .run();
  logEdit(db, editor.name, "Uppdaterade uppgifterna om babyshowern");
  refresh();
  return { ok: true, at: Date.now() };
}

/* ---------- Categories ---------- */

export async function addCategory(formData: FormData) {
  const editor = await requireEditor();
  const parsed = categorySchema.safeParse(formToObject(formData));
  if (!parsed.success) return;
  const db = getDb();
  const top = db.select({ m: max(category.sortOrder) }).from(category).get()?.m ?? 0;
  db.insert(category)
    .values({ name: bilingual(parsed.data.nameSv, parsed.data.nameEn), sortOrder: top + 10 })
    .run();
  logEdit(db, editor.name, `Lade till kategorin "${parsed.data.nameSv}"`);
  refresh();
}

export async function updateCategory(formData: FormData) {
  const editor = await requireEditor();
  const id = idFrom(formData);
  const parsed = categorySchema.safeParse(formToObject(formData));
  if (!id || !parsed.success) return;
  const db = getDb();
  db.update(category)
    .set({ name: bilingual(parsed.data.nameSv, parsed.data.nameEn), sortOrder: parsed.data.sortOrder })
    .where(eq(category.id, id))
    .run();
  logEdit(db, editor.name, `Ändrade kategorin "${parsed.data.nameSv}"`);
  refresh();
}

export async function deleteCategory(formData: FormData) {
  const editor = await requireEditor();
  const id = idFrom(formData);
  if (!id) return;
  const db = getDb();
  const row = db.select().from(category).where(eq(category.id, id)).get();
  if (!row) return;
  db.delete(category).where(eq(category.id, id)).run();
  logEdit(db, editor.name, `Tog bort kategorin "${row.name.sv}"`);
  refresh();
}

/** Renumber rows 10, 20, 30… then swap the target with its neighbour. */
function moveRow<T extends { id: number }>(rows: T[], id: number, dir: "up" | "down"): { id: number; sortOrder: number }[] | null {
  const idx = rows.findIndex((r) => r.id === id);
  const swapWith = dir === "up" ? idx - 1 : idx + 1;
  if (idx < 0 || swapWith < 0 || swapWith >= rows.length) return null;
  const ordered = rows.map((r) => r.id);
  [ordered[idx], ordered[swapWith]] = [ordered[swapWith]!, ordered[idx]!];
  return ordered.map((rid, i) => ({ id: rid, sortOrder: (i + 1) * 10 }));
}

export async function moveCategory(formData: FormData) {
  const editor = await requireEditor();
  const id = idFrom(formData);
  const dir = formData.get("dir") === "up" ? "up" : "down";
  if (!id) return;
  const db = getDb();
  const rows = db.select().from(category).orderBy(asc(category.sortOrder), asc(category.id)).all();
  const next = moveRow(rows, id, dir);
  if (!next) return;
  db.transaction((tx) => {
    for (const r of next) tx.update(category).set({ sortOrder: r.sortOrder }).where(eq(category.id, r.id)).run();
  });
  logEdit(db, editor.name, `Flyttade kategorin "${rows.find((r) => r.id === id)?.name.sv}" ${dir === "up" ? "upp" : "ner"}`);
  refresh();
}

/* ---------- Items ---------- */

function itemName(db: DB, id: number): string {
  const row = db.select({ name: item.name }).from(item).where(eq(item.id, id)).get();
  return row ? t2(row.name, "sv") : `#${id}`;
}

export async function saveItem(_prev: FormState, formData: FormData): Promise<FormState> {
  const editor = await requireEditor();
  const id = idFrom(formData);
  const parsed = itemSchema.safeParse(formToObject(formData));
  if (!parsed.success) return { error: "invalid", at: Date.now() };
  const d = parsed.data;

  let imageUrl = d.imageUrl;
  const upload = formData.get("imageFile");
  if (upload instanceof File && upload.size > 0) {
    const saved = await saveImageUpload(upload, serverEnv().uploadsDir);
    if (!saved) return { error: "image", at: Date.now() };
    imageUrl = saved;
  }

  const db = getDb();
  if (d.categoryId !== null && !db.select({ id: category.id }).from(category).where(eq(category.id, d.categoryId)).get()) {
    return { error: "invalid", at: Date.now() };
  }
  const values = {
    name: bilingual(d.nameSv, d.nameEn),
    description: d.descriptionSv ? bilingual(d.descriptionSv, d.descriptionEn) : null,
    notes: d.notesSv ? bilingual(d.notesSv, d.notesEn) : null,
    imageUrl,
    storeUrl: d.storeUrl,
    price: d.price,
    qtyWanted: d.qtyWanted,
    priority: d.priority,
    categoryId: d.categoryId,
    usedOk: d.usedOk,
    visible: d.visible,
    updatedAt: new Date(),
  };

  if (id) {
    const res = db
      .update(item)
      .set({ ...values, sortOrder: d.sortOrder })
      .where(eq(item.id, id))
      .run();
    if (res.changes === 0) return { error: "invalid", at: Date.now() };
    logEdit(db, editor.name, `Ändrade "${d.nameSv}"`);
  } else {
    const top = db.select({ m: max(item.sortOrder) }).from(item).get()?.m ?? 0;
    db.insert(item)
      .values({ ...values, type: "physical", sortOrder: top + 10 })
      .run();
    logEdit(db, editor.name, `Lade till "${d.nameSv}"`);
  }
  refresh();
  redirect("/admin#items");
}

export async function deleteItem(formData: FormData) {
  const editor = await requireEditor();
  const id = idFrom(formData);
  if (!id) return;
  const db = getDb();
  const name = itemName(db, id);
  const res = db.delete(item).where(eq(item.id, id)).run();
  if (res.changes) logEdit(db, editor.name, `Tog bort "${name}"`);
  refresh();
}

export async function toggleItemVisible(formData: FormData) {
  const editor = await requireEditor();
  const id = idFrom(formData);
  if (!id) return;
  const db = getDb();
  const row = db.select({ visible: item.visible }).from(item).where(eq(item.id, id)).get();
  if (!row) return;
  db.update(item).set({ visible: !row.visible, updatedAt: new Date() }).where(eq(item.id, id)).run();
  logEdit(db, editor.name, `${row.visible ? "Dolde" : "Visade"} "${itemName(db, id)}"`);
  refresh();
}

export async function moveItem(formData: FormData) {
  const editor = await requireEditor();
  const id = idFrom(formData);
  const dir = formData.get("dir") === "up" ? "up" : "down";
  if (!id) return;
  const db = getDb();
  const rows = db.select({ id: item.id }).from(item).orderBy(asc(item.sortOrder), asc(item.id)).all();
  const next = moveRow(rows, id, dir);
  if (!next) return;
  db.transaction((tx) => {
    for (const r of next) tx.update(item).set({ sortOrder: r.sortOrder }).where(eq(item.id, r.id)).run();
  });
  logEdit(db, editor.name, `Flyttade "${itemName(db, id)}" ${dir === "up" ? "upp" : "ner"}`);
  refresh();
}

/* ---------- Link scraping ---------- */

export type FetchResult = { ok: true; product: ScrapedProduct } | { ok: false };

const MAX_HTML_BYTES = 3 * 1024 * 1024;

export async function fetchFromLink(url: string): Promise<FetchResult> {
  await requireEditor();
  if (typeof url !== "string" || !isFetchableUrl(url.trim())) return { ok: false };
  try {
    const res = await fetch(url.trim(), {
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; BabyshowerRegistry/1.0; +link preview)",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "sv-SE,sv;q=0.9,en;q=0.8",
      },
    });
    if (!res.ok || !res.body) return { ok: false };
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (total < MAX_HTML_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.byteLength;
    }
    await reader.cancel().catch(() => {});
    const html = new TextDecoder().decode(Buffer.concat(chunks));
    const product = parseProductHtml(html, res.url || url);
    if (!product.title && !product.imageUrl && product.price === null) return { ok: false };
    return { ok: true, product };
  } catch {
    return { ok: false };
  }
}

"use server";

import { and, asc, count, eq, inArray, max } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb, type DB } from "@/db";
import { logEdit } from "@/db/queries";
import { category, claim, item, registry, type ItemType } from "@/db/schema";
import { requireEditor } from "@/lib/auth";
import { serverEnv } from "@/lib/env";
import { bilingual, t2 } from "@/lib/i18n";
import { fetchHtml, isFetchableUrl, parseProductHtml, type ScrapedProduct } from "@/lib/scrape";
import { backupNow } from "@/lib/backup";
import { checkLinks, LINKCHECK_COOLDOWN_MS } from "@/lib/linkcheck";
import { RateLimiter } from "@/lib/rate-limit";
import { saveImageUpload } from "@/lib/uploads";
import { categorySchema, formToObject, itemSchema, registrySchema } from "@/lib/validation";

export interface FormState {
  ok?: boolean;
  error?: "invalid" | "image" | "swish" | "goal" | "typeLocked";
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
  if (!parsed.success) {
    const swish = parsed.error.issues.some((i) => i.path[0] === "swishNumber");
    return { error: swish ? "swish" : "invalid", at: Date.now() };
  }
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
  // Only empty categories can be deleted (hidden starter suggestions count too).
  const inUse = db.select({ n: count() }).from(item).where(eq(item.categoryId, id)).get()?.n ?? 0;
  if (inUse > 0) return;
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

const typeLabel: Record<ItemType, string> = { physical: "sak", group: "gruppresent", fund: "insamling" };

export async function saveItem(_prev: FormState, formData: FormData): Promise<FormState> {
  const editor = await requireEditor();
  const id = idFrom(formData);
  const parsed = itemSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    const goal = parsed.error.issues.some((i) => i.path[0] === "goalAmount");
    return { error: goal ? "goal" : "invalid", at: Date.now() };
  }
  const d = parsed.data;
  const isFund = d.type === "fund";

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
  // Funds are not products: no image, link, price, quantity or "used ok". Group gifts are one item.
  const values = {
    type: d.type,
    name: bilingual(d.nameSv, d.nameEn),
    description: d.descriptionSv || d.descriptionEn ? bilingual(d.descriptionSv, d.descriptionEn) : null,
    notes: d.notesSv || d.notesEn ? bilingual(d.notesSv, d.notesEn) : null,
    imageUrl: isFund ? null : imageUrl,
    storeUrl: isFund ? null : d.storeUrl,
    price: isFund ? null : d.price,
    qtyWanted: d.type === "physical" ? d.qtyWanted : 1,
    priority: d.priority,
    categoryId: d.categoryId,
    usedOk: d.type === "physical" ? d.usedOk : false,
    goalAmount: d.type === "physical" ? null : (d.goalAmount ?? d.price),
    visible: d.visible,
    updatedAt: new Date(),
  };

  if (id) {
    const before = db.select({ type: item.type, storeUrl: item.storeUrl }).from(item).where(eq(item.id, id)).get();
    if (!before) return { error: "invalid", at: Date.now() };
    if (before.type !== d.type) {
      // Changing type under live claims would turn reservations into money (or back): refuse.
      const active =
        db
          .select({ n: count() })
          .from(claim)
          .where(and(eq(claim.itemId, id), inArray(claim.status, ["reserved", "purchased"])))
          .get()?.n ?? 0;
      if (active > 0) return { error: "typeLocked", at: Date.now() };
    }
    // A new store link has not been checked yet: drop the old link-check result.
    const linkReset = before.storeUrl !== values.storeUrl ? { linkStatus: null, linkCheckedAt: null, scrapedPrice: null } : {};
    db.update(item)
      .set({ ...values, ...linkReset, sortOrder: d.sortOrder })
      .where(eq(item.id, id))
      .run();
    logEdit(db, editor.name, `Ändrade "${d.nameSv}"`);
    if (before.type !== d.type) {
      logEdit(db, editor.name, `Ändrade typ på "${d.nameSv}" från ${typeLabel[before.type]} till ${typeLabel[d.type]}`);
    }
  } else {
    const top = db.select({ m: max(item.sortOrder) }).from(item).get()?.m ?? 0;
    db.insert(item)
      .values({ ...values, sortOrder: top + 10 })
      .run();
    logEdit(db, editor.name, d.type === "physical" ? `Lade till "${d.nameSv}"` : `Lade till ${typeLabel[d.type]}en "${d.nameSv}"`);
  }
  refresh();
  // A redirect from a server action drops the #fragment, so the dashboard scrolls to #items
  // itself when it sees ?saved=1 (see ScrollToItems).
  redirect("/admin?saved=1#items");
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

/* ---------- Starter list ---------- */

export async function toggleStarterItem(formData: FormData) {
  const editor = await requireEditor();
  const id = idFrom(formData);
  if (!id) return;
  const db = getDb();
  const row = db.select({ visible: item.visible, seeded: item.seeded }).from(item).where(eq(item.id, id)).get();
  if (!row || !row.seeded) return;
  db.update(item).set({ visible: !row.visible, updatedAt: new Date() }).where(eq(item.id, id)).run();
  logEdit(db, editor.name, `${row.visible ? "Dolde" : "Visade"} startförslaget "${itemName(db, id)}"`);
  refresh();
}

export async function setStarterCategoryVisible(formData: FormData) {
  const editor = await requireEditor();
  const visible = formData.get("visible") === "1";
  const raw = formData.get("categoryId");
  const categoryId = raw === "none" ? null : Number(raw);
  if (categoryId !== null && (!Number.isInteger(categoryId) || categoryId < 1)) return;
  const db = getDb();
  const ids = db
    .select({ id: item.id, categoryId: item.categoryId })
    .from(item)
    .where(eq(item.seeded, true))
    .all()
    .filter((r) => r.categoryId === categoryId)
    .map((r) => r.id);
  if (!ids.length) return;
  const res = db.update(item).set({ visible, updatedAt: new Date() }).where(inArray(item.id, ids)).run();
  const cat = categoryId ? db.select({ name: category.name }).from(category).where(eq(category.id, categoryId)).get() : null;
  logEdit(
    db,
    editor.name,
    `${visible ? "Visade" : "Dolde"} alla startförslag i ${cat ? `"${cat.name.sv}"` : "utan kategori"} (${res.changes} st)`,
  );
  refresh();
}

/* ---------- Link scraping ---------- */

export type FetchResult = { ok: true; product: ScrapedProduct } | { ok: false };

export async function fetchFromLink(url: string): Promise<FetchResult> {
  await requireEditor();
  if (typeof url !== "string" || !isFetchableUrl(url.trim())) return { ok: false };
  const page = await fetchHtml(url.trim());
  if (!page.ok) return { ok: false };
  const product = parseProductHtml(page.html, page.url);
  if (!product.title && !product.imageUrl && product.price === null) return { ok: false };
  return { ok: true, product };
}

/* ---------- Dead-link and price check ---------- */

export type LinkCheckState =
  | { status: "idle" }
  | { status: "done"; checked: number; dead: number; changed: number; at: number }
  | { status: "rateLimited"; minutes: number; at: number };

const globalForLinks = globalThis as unknown as { __linkCheckLimiter?: RateLimiter; __linkCheckLast?: number };
const linkLimiter = (globalForLinks.__linkCheckLimiter ??= new RateLimiter(1, LINKCHECK_COOLDOWN_MS));

export async function checkLinksAction(): Promise<LinkCheckState> {
  const editor = await requireEditor();
  const now = Date.now();
  if (!linkLimiter.attempt("all", now)) {
    const waitMs = LINKCHECK_COOLDOWN_MS - (now - (globalForLinks.__linkCheckLast ?? now));
    return { status: "rateLimited", minutes: Math.max(1, Math.ceil(waitMs / 60000)), at: now };
  }
  globalForLinks.__linkCheckLast = now;
  const db = getDb();
  const targets = db
    .select({ id: item.id, storeUrl: item.storeUrl, price: item.price })
    .from(item)
    .where(eq(item.visible, true))
    .all()
    .filter((r): r is { id: number; storeUrl: string; price: number | null } => !!r.storeUrl);
  const results = await checkLinks(targets);
  const checkedAt = new Date();
  db.transaction((tx) => {
    for (const r of results) {
      tx.update(item)
        .set({ linkStatus: r.status, linkCheckedAt: checkedAt, scrapedPrice: r.scrapedPrice })
        .where(eq(item.id, r.id))
        .run();
    }
  });
  const dead = results.filter((r) => r.status === "dead").length;
  const changed = results.filter((r) => r.status === "changed").length;
  logEdit(db, editor.name, `Kontrollerade ${results.length} länkar (${dead} döda, ${changed} med ändrat pris)`);
  refresh();
  return { status: "done", checked: results.length, dead, changed, at: now };
}

/* ---------- Backups ---------- */

export type BackupState =
  | { status: "idle" }
  | { status: "done"; name: string; count: number; at: number }
  | { status: "failed"; at: number };

export async function backupNowAction(): Promise<BackupState> {
  const editor = await requireEditor();
  try {
    const res = await backupNow();
    logEdit(getDb(), editor.name, `Säkerhetskopierade databasen (${res.name})`);
    revalidatePath("/admin");
    return { status: "done", name: res.name, count: res.count, at: Date.now() };
  } catch (err) {
    console.error("[backup] failed:", err instanceof Error ? err.message : err);
    return { status: "failed", at: Date.now() };
  }
}

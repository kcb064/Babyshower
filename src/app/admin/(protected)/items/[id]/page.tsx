import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getLocale, getTranslations } from "next-intl/server";
import { getDb } from "@/db";
import { listCategories } from "@/db/queries";
import { item as itemTable } from "@/db/schema";
import { normalizeLocale, t2 } from "@/lib/i18n";
import { resolveProvider } from "@/lib/translate";
import { ItemForm } from "../ItemForm";

export default async function EditItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const db = getDb();
  const item = db.select().from(itemTable).where(eq(itemTable.id, Number(id))).get();
  if (!item) notFound();
  const locale = normalizeLocale(await getLocale());
  const t = await getTranslations("admin.items");
  const categories = listCategories(db).map((c) => ({ id: c.id, name: t2(c.name, locale) }));
  return (
    <div className="py-6">
      <Link href="/admin#items" className="text-sm font-medium text-clay-deep underline underline-offset-2">
        ← {t("back")}
      </Link>
      <h1 className="mb-6 mt-3 text-5xl">{t("editTitle")}</h1>
      <ItemForm item={item} categories={categories} translateEnabled={resolveProvider(process.env) !== "none"} />
    </div>
  );
}

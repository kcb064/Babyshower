import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { getDb } from "@/db";
import { listCategories } from "@/db/queries";
import { normalizeLocale, t2 } from "@/lib/i18n";
import { resolveProvider } from "@/lib/translate";
import { ItemForm } from "../ItemForm";

export default async function NewItemPage() {
  const locale = normalizeLocale(await getLocale());
  const t = await getTranslations("admin.items");
  const categories = listCategories(getDb()).map((c) => ({ id: c.id, name: t2(c.name, locale) }));
  return (
    <div className="py-6">
      <Link href="/admin#items" className="text-sm font-medium text-clay-deep underline underline-offset-2">
        ← {t("back")}
      </Link>
      <h1 className="mb-6 mt-3 text-5xl">{t("newTitle")}</h1>
      <ItemForm categories={categories} translateEnabled={resolveProvider(process.env) !== "none"} />
    </div>
  );
}

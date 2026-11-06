import Link from "next/link";
import { getTranslations } from "next-intl/server";

export default async function NotFound() {
  const t = await getTranslations();
  return (
    <div className="mx-auto max-w-xl px-4 py-16 text-center">
      <h1 className="text-4xl">{t("errors.notFoundTitle")}</h1>
      <p className="mt-3 text-ink-soft">{t("errors.notFoundBody")}</p>
      <Link href="/" className="btn btn-secondary mt-6">
        {t("item.back")}
      </Link>
    </div>
  );
}

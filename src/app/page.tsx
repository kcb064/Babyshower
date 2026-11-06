import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { EucalyptusBranch, MonsteraLeaf } from "@/components/Botanical";
import { ItemCard } from "@/components/ItemCard";
import { getDb } from "@/db";
import { getRegistry, listCategories, listPublicItems } from "@/db/queries";
import { formatEventDateTime } from "@/lib/format";
import { normalizeLocale, t2 } from "@/lib/i18n";

export default async function HomePage({ searchParams }: { searchParams: Promise<{ kategori?: string }> }) {
  const locale = normalizeLocale(await getLocale());
  const t = await getTranslations();
  const db = getDb();
  const registry = getRegistry(db);
  const items = listPublicItems(db);
  const categories = listCategories(db).filter((c) => items.some((i) => i.categoryId === c.id));
  const { kategori } = await searchParams;
  const activeId = kategori && /^\d+$/.test(kategori) ? Number(kategori) : null;
  const shown = activeId ? items.filter((i) => i.categoryId === activeId) : items;
  const welcome = t2(registry.welcome, locale);

  return (
    <>
      <section className="relative overflow-hidden bg-eucalyptus text-ink" aria-labelledby="cover-title">
        <EucalyptusBranch className="pointer-events-none absolute -right-14 -top-6 h-52 text-ink/25 sm:right-6 sm:top-0 sm:h-72 sm:text-ink/35" />
        <MonsteraLeaf className="pointer-events-none absolute -bottom-10 -left-10 h-44 rotate-[18deg] text-ink/25 sm:left-4 sm:h-56" />
        <div className="fade-in relative mx-auto max-w-5xl px-4 pb-12 pt-12 sm:pb-16 sm:pt-20">
          <h1 id="cover-title" className="max-w-[12ch] text-5xl sm:text-7xl" data-testid="registry-title">
            {t2(registry.title, locale)}
          </h1>
          {welcome && <p className="mt-4 max-w-xl whitespace-pre-line pr-6 text-base sm:pr-0 sm:text-lg">{welcome}</p>}
          <dl className="mt-8 grid max-w-2xl gap-3 sm:grid-cols-3">
            <div className="rounded-[var(--radius)] bg-paper/70 p-3">
              <dt className="text-xs font-semibold uppercase tracking-wider text-eucalyptus-deep">{t("cover.when")}</dt>
              <dd className="mt-1 first-letter:uppercase">{formatEventDateTime(registry.eventDate, registry.eventTime, locale)}</dd>
            </div>
            {registry.location && (
              <div className="rounded-[var(--radius)] bg-paper/70 p-3">
                <dt className="text-xs font-semibold uppercase tracking-wider text-eucalyptus-deep">{t("cover.where")}</dt>
                <dd className="mt-1">
                  {registry.location}
                  {registry.mapUrl && (
                    <>
                      {" "}
                      <a href={registry.mapUrl} target="_blank" rel="noopener noreferrer" className="block text-sm font-medium text-clay-deep underline underline-offset-2">
                        {t("cover.map")}
                      </a>
                    </>
                  )}
                </dd>
              </div>
            )}
            {registry.hostContact && (
              <div className="rounded-[var(--radius)] bg-paper/70 p-3">
                <dt className="text-xs font-semibold uppercase tracking-wider text-eucalyptus-deep">{t("cover.contact")}</dt>
                <dd className="mt-1 break-words">{registry.hostContact}</dd>
              </div>
            )}
          </dl>
          <a href="#lista" className="btn btn-primary mt-8">
            {t("cover.toList")}
          </a>
        </div>
      </section>

      <section id="lista" className="mx-auto max-w-5xl scroll-mt-16 px-4 py-10" aria-labelledby="list-title">
        <h2 id="list-title" className="text-4xl">
          {t("list.heading")}
        </h2>
        <p className="mt-2 max-w-2xl text-ink-soft">{t("list.intro")}</p>

        {categories.length > 0 && (
          <nav aria-label={t("list.filter")} className="-mx-4 mt-6 overflow-x-auto px-4 pb-2">
            <ul className="flex gap-2">
              <li>
                <Link href="/#lista" scroll={false} className="chip" aria-current={activeId === null ? "true" : undefined}>
                  {t("list.all")}
                </Link>
              </li>
              {categories.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/?kategori=${c.id}#lista`}
                    scroll={false}
                    className="chip"
                    aria-current={activeId === c.id ? "true" : undefined}
                  >
                    {t2(c.name, locale)}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}

        {shown.length === 0 ? (
          <p className="card mt-6 p-6 text-center text-ink-soft">{activeId ? t("list.emptyCategory") : t("list.empty")}</p>
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((item) => (
              <ItemCard key={item.id} item={item} locale={locale} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}

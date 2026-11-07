import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { GiftList } from "@/components/GiftList";
import { getDb } from "@/db";
import { groupGifts, listRevealedGifts, thankCounts } from "@/db/gifts";
import { getRegistry, listAdminItems } from "@/db/queries";
import { formatSEK } from "@/lib/format";
import { normalizeLocale, t2 } from "@/lib/i18n";

export const dynamic = "force-dynamic";

const filters = ["all", "todo", "done"] as const;
type Filter = (typeof filters)[number];

export default async function GiftsPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const locale = normalizeLocale(await getLocale());
  const t = await getTranslations("admin.gifts");
  const db = getDb();
  const registry = getRegistry(db);
  const rows = listRevealedGifts(db);

  if (!rows) {
    // Surprise mode: the same aggregate numbers as the dashboard, nothing per guest.
    const items = listAdminItems(db, false).filter((i) => i.aggregate.qtyClaimed > 0 || (i.fund && i.fund.contributors > 0));
    return (
      <div className="space-y-6 py-6">
        <div>
          <h1 className="text-5xl">{t("title")}</h1>
          <p className="mt-3 rounded-[var(--radius)] border border-eucalyptus bg-eucalyptus-soft p-3 text-sm" data-testid="gifts-surprise">
            {t("surprise")}{" "}
            <Link href="/admin/reveal" className="font-medium text-clay-deep underline underline-offset-2" data-testid="gifts-reveal-link">
              {t("toReveal")}
            </Link>
          </p>
        </div>
        {items.length === 0 ? (
          <p className="card p-6 text-center text-ink-soft">{t("empty")}</p>
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full text-left text-sm" data-testid="gifts-aggregate">
              <thead className="bg-linen text-xs uppercase tracking-wide text-ink-soft">
                <tr>
                  <th scope="col" className="px-3 py-2 font-semibold">
                    {t("colItem")}
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-semibold">
                    {t("colClaimed")}
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-semibold">
                    {t("colPurchased")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {items.map((i) => (
                  <tr key={i.id} data-testid="gifts-aggregate-row">
                    <th scope="row" className="px-3 py-2 font-medium">
                      {t2(i.name, locale)}
                    </th>
                    {i.fund && !i.fund.boughtWhole ? (
                      <td colSpan={2} className="px-3 py-2 text-right tabular-nums">
                        {formatSEK(i.fund.confirmed)} / {formatSEK(i.fund.goal)}
                        <span className="block text-xs text-ink-soft">{t("contributions", { count: i.fund.contributors })}</span>
                      </td>
                    ) : (
                      <>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {i.aggregate.qtyClaimed} / {i.aggregate.total}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{i.aggregate.qtyPurchased}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  const { filter: rawFilter } = await searchParams;
  const filter: Filter = filters.includes(rawFilter as Filter) ? (rawFilter as Filter) : "all";
  const counts = thankCounts(rows);
  const shown = rows.filter((r) => (filter === "all" ? true : filter === "done" ? r.thankedAt !== null : r.thankedAt === null));
  const groups = groupGifts(db, shown);

  return (
    <div className="space-y-6 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-5xl">{t("title")}</h1>
          <p className="mt-2 text-lg" data-testid="thank-count">
            {t("thankCount", { thanked: counts.thanked, total: counts.total })}
          </p>
          {registry.revealedBy && <p className="text-sm text-ink-soft">{t("revealedBy", { name: registry.revealedBy })}</p>}
        </div>
        <a href="/admin/gifts/export.csv" className="btn btn-secondary" data-testid="export-csv" download>
          {t("export")}
        </a>
      </div>
      <nav aria-label={t("filterLabel")} className="flex flex-wrap gap-2 text-sm">
        {filters.map((f) => (
          <Link
            key={f}
            href={f === "all" ? "/admin/gifts" : `/admin/gifts?filter=${f}`}
            className="chip"
            aria-current={filter === f ? "true" : undefined}
            data-testid={`filter-${f}`}
          >
            {t(`filter.${f}`)}
          </Link>
        ))}
      </nav>
      <GiftList groups={groups} thankable />
    </div>
  );
}

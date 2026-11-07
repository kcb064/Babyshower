import { getLocale, getTranslations } from "next-intl/server";
import { getDb } from "@/db";
import { listCategories, listStarterItems } from "@/db/queries";
import { formatSEK } from "@/lib/format";
import { normalizeLocale, t2 } from "@/lib/i18n";
import { setStarterCategoryVisible, toggleStarterItem } from "../actions";

export default async function StarterPage() {
  const locale = normalizeLocale(await getLocale());
  const t = await getTranslations("admin");
  const db = getDb();
  const items = listStarterItems(db);
  const categories = listCategories(db);
  const groups = [
    ...categories.map((c) => ({ key: String(c.id), name: t2(c.name, locale), items: items.filter((i) => i.categoryId === c.id) })),
    { key: "none", name: t("starter.noCategory"), items: items.filter((i) => i.categoryId === null || !categories.some((c) => c.id === i.categoryId)) },
  ].filter((g) => g.items.length > 0);

  return (
    <div className="space-y-8 py-6">
      <div>
        <h1 className="text-5xl">{t("starter.title")}</h1>
        <p className="mt-2 max-w-2xl text-ink-soft">{t("starter.intro")}</p>
        <p className="mt-3 rounded-[var(--radius)] border border-eucalyptus bg-eucalyptus-soft p-3 text-sm" data-testid="starter-note">
          {t("starter.hiddenNote")}
        </p>
      </div>
      {groups.length === 0 && <p className="card p-6 text-center text-ink-soft">{t("starter.empty")}</p>}
      {groups.map((g) => {
        const shown = g.items.filter((i) => i.visible).length;
        return (
          <section key={g.key} aria-labelledby={`starter-${g.key}`} className="card p-4 sm:p-6" data-testid="starter-category">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 id={`starter-${g.key}`} className="text-3xl">
                  {g.name}
                </h2>
                <p className="text-sm text-ink-soft">{t("starter.summary", { visible: shown, total: g.items.length })}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <form action={setStarterCategoryVisible}>
                  <input type="hidden" name="categoryId" value={g.key} />
                  <input type="hidden" name="visible" value="1" />
                  <button type="submit" className="btn btn-secondary btn-small" disabled={shown === g.items.length}>
                    {t("starter.showAll")}
                  </button>
                </form>
                <form action={setStarterCategoryVisible}>
                  <input type="hidden" name="categoryId" value={g.key} />
                  <input type="hidden" name="visible" value="0" />
                  <button type="submit" className="btn btn-ghost btn-small" disabled={shown === 0}>
                    {t("starter.hideAll")}
                  </button>
                </form>
              </div>
            </div>
            <ul className="mt-4 divide-y divide-line">
              {g.items.map((it) => {
                const name = t2(it.name, locale);
                const notes = t2(it.notes, locale);
                return (
                  <li key={it.id} className="flex items-center gap-3 py-2" data-testid="starter-item" data-item-id={it.id}>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold" data-testid="starter-item-name">
                        {name}
                      </p>
                      <p className="text-xs text-ink-soft">
                        {[it.price !== null ? formatSEK(it.price) : null, it.qtyWanted > 1 ? `× ${it.qtyWanted}` : null, notes || null]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <form action={toggleStarterItem} className="shrink-0">
                      <input type="hidden" name="id" value={it.id} />
                      <button
                        type="submit"
                        role="switch"
                        aria-checked={it.visible}
                        aria-label={`${it.visible ? t("starter.hide") : t("starter.show")}: ${name}`}
                        className={`inline-flex min-h-11 min-w-24 items-center justify-center gap-2 rounded-full border px-3 text-sm font-semibold ${
                          it.visible ? "border-eucalyptus-deep bg-eucalyptus-deep text-white" : "border-line bg-paper text-ink-soft"
                        }`}
                        data-testid="starter-toggle"
                      >
                        <span
                          aria-hidden="true"
                          className={`inline-block h-2.5 w-2.5 rounded-full ${it.visible ? "bg-white" : "border border-ink-soft"}`}
                        />
                        {it.visible ? t("starter.visible") : t("starter.hidden")}
                      </button>
                    </form>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import { ItemImage } from "@/components/ItemImage";
import { getDb } from "@/db";
import { GiftList } from "@/components/GiftList";
import { groupGifts, listRevealedGifts } from "@/db/gifts";
import { getRegistry, listAdminItems, listCategories, recentEditorLog } from "@/db/queries";
import { formatDateTime, formatRelative, formatSEK } from "@/lib/format";
import { normalizeLocale, t2 } from "@/lib/i18n";
import { listBackups, backupsDir } from "@/lib/backup";
import { linkBadge } from "@/lib/linkcheck";
import { BackupButton, LinkCheckButton } from "./AdminTools";
import { ScrollToItems } from "./ScrollToItems";
import { addCategory, deleteCategory, deleteItem, moveCategory, moveItem, toggleItemVisible, updateCategory } from "./actions";
import { RegistryForm } from "./RegistryForm";

export default async function AdminPage() {
  const locale = normalizeLocale(await getLocale());
  const t = await getTranslations("admin");
  const db = getDb();
  const registry = getRegistry(db);
  const categories = listCategories(db);
  const allItems = listAdminItems(db, registry.revealed);
  // Hidden starter suggestions live on /admin/starter so they do not crowd the main list.
  const items = allItems.filter((i) => !(i.seeded && !i.visible));
  const hiddenStarter = allItems.length - items.length;
  const log = recentEditorLog(db, 20);
  const now = new Date();
  const catName = new Map(categories.map((c) => [c.id, t2(c.name, locale)]));
  const catCount = new Map<number, number>();
  for (const i of allItems) if (i.categoryId) catCount.set(i.categoryId, (catCount.get(i.categoryId) ?? 0) + 1);
  const backups = listBackups(backupsDir());
  // Only non-null after reveal: the surprise-mode rule lives in listRevealedGifts.
  const revealedGifts = listRevealedGifts(db, now);

  return (
    <div className="space-y-10 py-6">
      <ScrollToItems />
      <div>
        <h1 className="text-5xl">{t("title")}</h1>
        {!registry.revealed && (
          <p
            className="mt-3 rounded-[var(--radius)] border border-eucalyptus bg-eucalyptus-soft p-3 text-sm"
            data-testid="surprise-banner"
          >
            {t("surprise")}
          </p>
        )}
        <div className="card mt-3 flex flex-wrap items-center justify-between gap-3 p-3 text-sm" data-testid="reveal-status">
          <div className="min-w-0 space-y-1">
            <p className="font-semibold" data-testid="reveal-state">
              {registry.revealed
                ? t("status.revealed", {
                    name: registry.revealedBy ?? "?",
                    when: registry.revealedAt ? formatDateTime(registry.revealedAt, locale) : "",
                  })
                : t("status.notRevealed")}
            </p>
            {!registry.revealed && registry.lastPeekAt && registry.lastPeekBy && (
              <p className="text-ink-soft" data-testid="dashboard-last-peek">
                {t("status.lastPeek", { name: registry.lastPeekBy, when: formatRelative(registry.lastPeekAt, now, locale) })}
              </p>
            )}
          </div>
          <Link href={registry.revealed ? "/admin/gifts" : "/admin/reveal"} className="btn btn-secondary btn-small">
            {registry.revealed ? t("status.toGifts") : t("status.toReveal")}
          </Link>
        </div>
      </div>

      <section id="items" aria-labelledby="items-title" className="scroll-mt-16">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="items-title" className="text-3xl">
            {t("items.heading")}
          </h2>
          <Link href="/admin/items/new" className="btn btn-primary" data-testid="add-item">
            + {t("items.add")}
          </Link>
        </div>
        {hiddenStarter > 0 && (
          <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-soft" data-testid="starter-hidden-note">
            {t("items.starterHidden", { count: hiddenStarter })}
            <Link href="/admin/starter" className="font-medium text-clay-deep underline underline-offset-2">
              {t("items.starterLink")}
            </Link>
          </p>
        )}
        {items.length === 0 ? (
          <p className="card mt-4 p-6 text-center text-ink-soft">{t("items.empty")}</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {items.map((it, idx) => (
              <li
                key={it.id}
                className="card flex flex-col gap-3 p-3 sm:flex-row sm:items-center"
                data-testid="admin-item"
                data-item-id={it.id}
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <ItemImage src={it.imageUrl} alt="" className="h-14 w-14 shrink-0 rounded-[var(--radius)] border border-line" />
                  <div className="min-w-0">
                    <p className="truncate font-semibold" data-testid="admin-item-name">
                      {t2(it.name, locale)}
                      {it.type !== "physical" && (
                        <span className="badge ml-2 bg-clay-soft text-clay-deep">
                          {t(it.type === "group" ? "items.typeGroup" : "items.typeFund")}
                        </span>
                      )}
                      {it.seeded && (
                        <span className="badge ml-2 bg-eucalyptus-soft text-eucalyptus-deep">{t("items.starter")}</span>
                      )}
                      {!it.visible && <span className="badge ml-2 bg-linen-deep text-ink-soft">{t("items.hidden")}</span>}
                    </p>
                    <LinkBadgeView badge={linkBadge(it)} dead={t("items.linkDead")} priceText={(scraped, was) => t("items.linkPrice", { price: formatSEK(scraped), was: formatSEK(was) })} />
                    <p className="text-xs text-ink-soft">
                      {[it.categoryId ? catName.get(it.categoryId) : null, it.price !== null ? formatSEK(it.price) : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {it.fund ? (
                      <p className="mt-1 flex flex-wrap gap-x-3 text-sm" data-testid="admin-fund">
                        {it.fund.boughtWhole ? (
                          <span className="font-semibold text-eucalyptus-deep">{t("items.fundBoughtWhole")}</span>
                        ) : (
                          <span>
                            {t("items.fundConfirmed")}:{" "}
                            <strong data-testid="fund-confirmed">
                              {formatSEK(it.fund.confirmed)} / {formatSEK(it.fund.goal)}
                            </strong>
                          </span>
                        )}
                        <span>
                          {t("items.fundContributors")}: <strong data-testid="fund-contributors">{it.fund.contributors}</strong>
                        </span>
                        <span>
                          {t("items.fundPending")}: <strong data-testid="fund-pending">{it.fund.pending}</strong>
                        </span>
                      </p>
                    ) : (
                      <p className="mt-1 flex flex-wrap gap-x-3 text-sm" data-testid="admin-aggregate">
                        <span>
                          {t("items.wanted")}: <strong>{it.aggregate.total}</strong>
                        </span>
                        <span>
                          {t("items.claimed")}: <strong data-testid="agg-claimed">{it.aggregate.qtyClaimed}</strong>
                        </span>
                        <span>
                          {t("items.purchased")}: <strong data-testid="agg-purchased">{it.aggregate.qtyPurchased}</strong>
                        </span>
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  <form action={moveItem}>
                    <input type="hidden" name="id" value={it.id} />
                    <input type="hidden" name="dir" value="up" />
                    <button
                      type="submit"
                      className="btn btn-ghost btn-small"
                      disabled={idx === 0}
                      aria-label={t("moveUp")}
                      title={t("moveUp")}
                    >
                      ↑
                    </button>
                  </form>
                  <form action={moveItem}>
                    <input type="hidden" name="id" value={it.id} />
                    <input type="hidden" name="dir" value="down" />
                    <button
                      type="submit"
                      className="btn btn-ghost btn-small"
                      disabled={idx === items.length - 1}
                      aria-label={t("moveDown")}
                      title={t("moveDown")}
                    >
                      ↓
                    </button>
                  </form>
                  <form action={toggleItemVisible}>
                    <input type="hidden" name="id" value={it.id} />
                    <button type="submit" className="btn btn-secondary btn-small">
                      {it.visible ? t("items.hide") : t("items.show")}
                    </button>
                  </form>
                  <Link href={`/admin/items/${it.id}`} className="btn btn-secondary btn-small">
                    {t("items.edit")}
                  </Link>
                  <form action={deleteItem}>
                    <input type="hidden" name="id" value={it.id} />
                    <ConfirmSubmit message={t("items.deleteConfirm")} className="btn btn-ghost btn-small text-danger">
                      {t("delete")}
                    </ConfirmSubmit>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {revealedGifts && (
        <section aria-labelledby="gifts-title" data-testid="dashboard-gifts">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 id="gifts-title" className="text-3xl">
              {t("gifts.title")}
            </h2>
            <Link href="/admin/gifts" className="btn btn-secondary btn-small">
              {t("status.toGifts")}
            </Link>
          </div>
          <div className="mt-4">
            <GiftList groups={groupGifts(db, revealedGifts)} />
          </div>
        </section>
      )}

      <section aria-labelledby="tools-title" className="card p-4 sm:p-6">
        <h2 id="tools-title" className="text-3xl">
          {t("tools.heading")}
        </h2>
        <div className="mt-4 grid gap-6 sm:grid-cols-2">
          <LinkCheckButton />
          <div className="space-y-2">
            <BackupButton />
            <p className="text-xs text-ink-soft" data-testid="backup-count">
              {backups[0] ? t("tools.backupLatest", { name: backups[0], count: backups.length }) : t("tools.backupNone")}
            </p>
          </div>
        </div>
      </section>

      <section aria-labelledby="registry-title" className="card p-4 sm:p-6">
        <h2 id="registry-title" className="mb-4 text-3xl">
          {t("registry.heading")}
        </h2>
        <RegistryForm registry={registry} />
      </section>

      <section aria-labelledby="categories-title" className="card p-4 sm:p-6">
        <h2 id="categories-title" className="text-3xl">
          {t("categories.heading")}
        </h2>
        <p className="mb-4 mt-1 text-sm text-ink-soft">{t("categories.deleteDisabled")}</p>
        <ul className="space-y-2">
          {categories.map((c, idx) => (
            <li key={c.id} className="flex flex-col gap-2 rounded-[var(--radius)] bg-linen p-2 sm:flex-row sm:items-center">
              <form action={updateCategory} className="flex flex-1 flex-wrap items-center gap-2">
                <input type="hidden" name="id" value={c.id} />
                <input type="hidden" name="sortOrder" value={c.sortOrder} />
                <input
                  name="nameSv"
                  defaultValue={c.name.sv}
                  required
                  aria-label={`${t("categories.name")} – ${t("swedish")}`}
                  className="field min-w-0 flex-1 basis-32"
                />
                <input
                  name="nameEn"
                  defaultValue={c.name.en ?? ""}
                  aria-label={`${t("categories.name")} – ${t("english")}`}
                  className="field min-w-0 flex-1 basis-32"
                />
                <button type="submit" className="btn btn-secondary btn-small">
                  {t("save")}
                </button>
              </form>
              <div className="flex items-center gap-1">
                <form action={moveCategory}>
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="dir" value="up" />
                  <button type="submit" className="btn btn-ghost btn-small" disabled={idx === 0} aria-label={t("moveUp")}>
                    ↑
                  </button>
                </form>
                <form action={moveCategory}>
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="dir" value="down" />
                  <button
                    type="submit"
                    className="btn btn-ghost btn-small"
                    disabled={idx === categories.length - 1}
                    aria-label={t("moveDown")}
                  >
                    ↓
                  </button>
                </form>
                <span className="px-1 text-xs text-ink-soft" data-testid="category-count">
                  {t("categories.count", { count: catCount.get(c.id) ?? 0 })}
                </span>
                <form action={deleteCategory}>
                  <input type="hidden" name="id" value={c.id} />
                  <ConfirmSubmit
                    message={t("categories.deleteConfirm")}
                    className="btn btn-ghost btn-small text-danger"
                    disabled={(catCount.get(c.id) ?? 0) > 0}
                    title={(catCount.get(c.id) ?? 0) > 0 ? t("categories.deleteDisabled") : undefined}
                  >
                    {t("delete")}
                  </ConfirmSubmit>
                </form>
              </div>
            </li>
          ))}
        </ul>
        <form action={addCategory} className="mt-4 flex flex-wrap items-center gap-2">
          <input
            name="nameSv"
            required
            placeholder={t("swedish")}
            aria-label={`${t("categories.name")} – ${t("swedish")}`}
            className="field min-w-0 flex-1 basis-32"
          />
          <input
            name="nameEn"
            placeholder={t("english")}
            aria-label={`${t("categories.name")} – ${t("english")}`}
            className="field min-w-0 flex-1 basis-32"
          />
          <button type="submit" className="btn btn-primary btn-small">
            + {t("categories.add")}
          </button>
        </form>
      </section>

      <section aria-labelledby="log-title">
        <h2 id="log-title" className="text-3xl">
          {t("log.heading")}
        </h2>
        {log.length === 0 ? (
          <p className="mt-3 text-ink-soft">{t("log.empty")}</p>
        ) : (
          <ol
            className="mt-3 divide-y divide-line rounded-[var(--radius)] border border-line bg-paper text-sm"
            data-testid="editor-log"
          >
            {log.map((entry) => (
              <li key={entry.id} className="flex flex-wrap gap-x-3 px-3 py-2">
                <time
                  className="text-ink-soft"
                  dateTime={entry.createdAt.toISOString()}
                  title={formatDateTime(entry.createdAt, locale)}
                >
                  {formatRelative(entry.createdAt, now, locale)}
                </time>
                <span className="font-semibold">{entry.who}</span>
                <span className="min-w-0 break-words">{entry.what}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function LinkBadgeView({
  badge,
  dead,
  priceText,
}: {
  badge: ReturnType<typeof linkBadge>;
  dead: string;
  priceText: (scraped: number, was: number) => string;
}) {
  if (!badge) return null;
  if (badge.kind === "dead") {
    return (
      <span className="badge mt-1 bg-danger-soft text-danger" data-testid="link-badge-dead">
        {dead}
      </span>
    );
  }
  return (
    <span className="badge mt-1 bg-amber-soft text-amber-deep" data-testid="link-badge-price">
      {priceText(badge.scraped, badge.price)}
    </span>
  );
}

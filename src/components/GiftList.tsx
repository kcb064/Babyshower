import { useLocale, useTranslations } from "next-intl";
import type { GiftGroup, GiftRow } from "@/db/gifts";
import { formatDateTime, formatSEK } from "@/lib/format";
import { normalizeLocale, t2 } from "@/lib/i18n";
import { ThankForm } from "./ThankForm";

/**
 * The full gift list with guest details, grouped by item. Rendered on /admin/gifts after reveal
 * (with thank-you controls) and once inside the Peek result on /admin/reveal (without).
 * No hooks beyond next-intl, so it works in both server and client trees.
 */
export function GiftList({ groups, thankable = false }: { groups: GiftGroup[]; thankable?: boolean }) {
  const t = useTranslations("admin.gifts");
  const locale = normalizeLocale(useLocale());
  if (groups.length === 0) return <p className="card p-6 text-center text-ink-soft">{t("empty")}</p>;
  return (
    <div className="space-y-4" data-testid="gift-list">
      {groups.map((g) => (
        <section key={g.itemId} className="card overflow-hidden" data-testid="gift-group" aria-labelledby={`gift-${g.itemId}`}>
          <header className="border-b border-line bg-linen px-4 py-3">
            <h3 id={`gift-${g.itemId}`} className="text-2xl leading-tight">
              {t2(g.itemName, locale)}
              {g.itemType !== "physical" && (
                <span className="badge ml-2 bg-clay-soft align-middle text-clay-deep">
                  {t(g.itemType === "group" ? "typeGroup" : "typeFund")}
                </span>
              )}
            </h3>
            <p className="mt-1 text-sm text-ink-soft" data-testid="gift-group-total">
              {g.itemType === "physical" || (g.itemType === "group" && g.qtyClaimed > 0)
                ? t("totalQty", { claimed: g.qtyClaimed, total: g.qtyWanted, purchased: g.qtyPurchased })
                : t("totalAmount", {
                    amount: formatSEK(g.amountConfirmed),
                    goal: formatSEK(g.goal ?? 0),
                    count: g.rows.filter((r) => r.amount !== null).length,
                  })}
            </p>
          </header>
          <ul className="divide-y divide-line">
            {g.rows.map((r) => (
              <GiftRowItem key={r.claimId} row={r} thankable={thankable} locale={locale} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function GiftRowItem({ row: r, thankable, locale }: { row: GiftRow; thankable: boolean; locale: "sv" | "en" }) {
  const t = useTranslations("admin.gifts");
  const statusClass =
    r.status === "purchased"
      ? "bg-eucalyptus-soft text-eucalyptus-deep"
      : r.status === "pending"
        ? "bg-amber-soft text-amber-deep"
        : "bg-linen-deep text-ink";
  return (
    <li className="space-y-2 px-4 py-3" data-testid="gift-row" data-claim-id={r.claimId}>
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <div className="min-w-0">
          <p className="font-semibold" data-testid="gift-guest">
            {r.guestName}
          </p>
          <a href={`mailto:${r.guestEmail}`} className="break-all text-sm text-clay-deep underline underline-offset-2" data-testid="gift-email">
            {r.guestEmail}
          </a>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-sm">
          <strong data-testid="gift-amount">{r.amount !== null ? formatSEK(r.amount) : `${r.qty} st`}</strong>
          <span className={`badge ${statusClass}`}>{t(`status.${r.status}`)}</span>
          {r.showName && <span className="badge bg-linen-deep text-ink-soft">{t("showName")}</span>}
        </div>
      </div>
      {r.message && (
        <blockquote className="border-l-2 border-eucalyptus pl-3 text-sm italic" data-testid="gift-message">
          {r.message}
        </blockquote>
      )}
      {r.address && (
        <p className="whitespace-pre-line text-sm text-ink-soft" data-testid="gift-address">
          <span className="sr-only">{t("address")}: </span>
          {r.address}
        </p>
      )}
      <p className="text-xs text-ink-soft">
        <time dateTime={r.createdAt.toISOString()}>{formatDateTime(r.createdAt, locale)}</time>
      </p>
      {thankable && <ThankForm claimId={r.claimId} thanked={r.thankedAt !== null} note={r.thankNote} />}
    </li>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ItemImage } from "@/components/ItemImage";
import { FundProgress } from "@/components/FundProgress";
import { ItemStatus } from "@/components/ItemStatus";
import { getDb } from "@/db";
import { getPublicItem, getRegistry } from "@/db/queries";
import { canBuyWhole, canContribute } from "@/lib/claims";
import { formatSEK } from "@/lib/format";
import { normalizeLocale, t2 } from "@/lib/i18n";
import { ClaimForm } from "./ClaimForm";
import { ContributionForm } from "./ContributionForm";

export default async function ItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const db = getDb();
  const item = getPublicItem(db, Number(id));
  if (!item) notFound();
  const swishNumber = getRegistry(db).swishNumber;
  const locale = normalizeLocale(await getLocale());
  const t = await getTranslations();
  const name = t2(item.name, locale);
  const description = t2(item.description, locale);
  const notes = t2(item.notes, locale);
  const canClaim = item.type === "physical" && item.status.remaining > 0;
  const fund = item.type === "physical" ? null : item.fund;
  const contributable = fund ? canContribute(item.type as "group" | "fund", fund) : false;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:py-10">
      <Link href="/#lista" className="text-sm font-medium text-clay-deep underline underline-offset-2">
        ← {t("item.back")}
      </Link>
      <div className="mt-4 grid gap-6 md:grid-cols-2 md:gap-10">
        <div>
          <ItemImage src={item.imageUrl} alt={name} className="card aspect-square w-full" />
        </div>
        <div>
          <div className="flex flex-wrap gap-1.5">
            {item.type === "group" && <span className="badge bg-linen-deep text-ink">{t("item.typeGroup")}</span>}
            {item.type === "fund" && <span className="badge bg-linen-deep text-ink">{t("item.typeFund")}</span>}
            {item.priority === "must" && <span className="badge bg-clay-soft text-clay-deep">{t("item.must")}</span>}
            {item.usedOk && <span className="badge bg-eucalyptus-soft text-eucalyptus-deep">{t("item.usedOk")}</span>}
          </div>
          <h1 className="mt-2 text-4xl sm:text-5xl" data-testid="item-title">
            {name}
          </h1>
          {item.price !== null && <p className="mt-2 text-lg">{formatSEK(item.price)}</p>}
          {description && <p className="mt-3 whitespace-pre-line text-ink-soft">{description}</p>}
          {notes && (
            <p className="mt-3 text-sm">
              <span className="font-semibold">{t("item.notes")}:</span> {notes}
            </p>
          )}
          <div className="mt-4">{fund ? <FundProgress fund={fund} size="lg" /> : <ItemStatus status={item.status} />}</div>
          {item.storeUrl && (
            <a href={item.storeUrl} target="_blank" rel="noopener noreferrer" className="btn btn-secondary mt-4">
              {t("item.store")} <span aria-hidden="true">↗</span>
            </a>
          )}
          {fund ? (
            <>
              <section id="bidra" className="card mt-6 scroll-mt-20 p-4 sm:p-6" aria-labelledby="contribute-title">
                <h2 id="contribute-title" className="text-3xl">
                  {t("contribute.title")}
                </h2>
                <div className="mt-2">
                  {!contributable ? (
                    <p className="text-ink-soft">{fund.boughtWhole ? t("item.boughtWhole") : t("contribute.closed")}</p>
                  ) : !swishNumber ? (
                    <p className="text-ink-soft">{t("contribute.noSwish")}</p>
                  ) : (
                    <>
                      <p className="mb-4 text-sm text-ink-soft">{t("contribute.intro")}</p>
                      <ContributionForm itemId={item.id} />
                    </>
                  )}
                </div>
              </section>
              {item.type === "group" && !fund.boughtWhole && (
                <section className="card mt-4 p-4 sm:p-6" aria-labelledby="buy-whole-title" data-testid="buy-whole">
                  <h2 id="buy-whole-title" className="text-2xl">
                    {t("contribute.buyWholeTitle")}
                  </h2>
                  {canBuyWhole(fund) ? (
                    <details className="group mt-2">
                      <summary
                        className="btn btn-secondary w-full list-none [&::-webkit-details-marker]:hidden"
                        data-testid="buy-whole-toggle"
                      >
                        {t("item.buyWhole")}
                      </summary>
                      <p className="mb-4 mt-3 text-sm text-ink-soft">{t("contribute.buyWholeHelp")}</p>
                      <ClaimForm itemId={item.id} remaining={1} submitLabel={t("item.buyWhole")} />
                    </details>
                  ) : (
                    <p className="mt-2 text-sm text-ink-soft">{t("contribute.buyWholeLocked")}</p>
                  )}
                </section>
              )}
            </>
          ) : (
            <section className="card mt-6 p-4 sm:p-6" aria-labelledby="claim-title">
              <h2 id="claim-title" className="text-3xl">
                {t("claim.title")}
              </h2>
              <div className="mt-4">
                {canClaim ? (
                  <ClaimForm itemId={item.id} remaining={item.status.remaining} />
                ) : (
                  <p className="text-ink-soft">{t("item.taken")}</p>
                )}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

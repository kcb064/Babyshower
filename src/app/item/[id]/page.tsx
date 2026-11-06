import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ItemImage } from "@/components/ItemImage";
import { ItemStatus } from "@/components/ItemStatus";
import { getDb } from "@/db";
import { getPublicItem } from "@/db/queries";
import { formatSEK } from "@/lib/format";
import { normalizeLocale, t2 } from "@/lib/i18n";
import { ClaimForm } from "./ClaimForm";

export default async function ItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const item = getPublicItem(getDb(), Number(id));
  if (!item) notFound();
  const locale = normalizeLocale(await getLocale());
  const t = await getTranslations();
  const name = t2(item.name, locale);
  const description = t2(item.description, locale);
  const notes = t2(item.notes, locale);
  const canClaim = item.type === "physical" && item.status.remaining > 0;

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
          <div className="mt-4">
            <ItemStatus status={item.status} />
          </div>
          {item.storeUrl && (
            <a href={item.storeUrl} target="_blank" rel="noopener noreferrer" className="btn btn-secondary mt-4">
              {t("item.store")} <span aria-hidden="true">↗</span>
            </a>
          )}
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
        </div>
      </div>
    </div>
  );
}

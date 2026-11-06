import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { PublicItem } from "@/db/queries";
import { formatSEK } from "@/lib/format";
import { t2, type Locale } from "@/lib/i18n";
import { ItemImage } from "./ItemImage";
import { ItemStatus } from "./ItemStatus";

export async function ItemCard({ item, locale }: { item: PublicItem; locale: Locale }) {
  const t = await getTranslations("item");
  const name = t2(item.name, locale);
  const notes = t2(item.notes, locale);
  const available = item.status.remaining > 0;
  return (
    <article className="card flex flex-col overflow-hidden" data-testid="item-card" data-item-id={item.id}>
      <Link href={`/item/${item.id}`} className="block" tabIndex={-1} aria-hidden="true">
        <ItemImage src={item.imageUrl} alt="" className="aspect-[16/11] w-full border-b border-line" />
      </Link>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex flex-wrap gap-1.5">
          {item.priority === "must" && <span className="badge bg-clay-soft text-clay-deep">{t("must")}</span>}
          {item.usedOk && <span className="badge bg-eucalyptus-soft text-eucalyptus-deep">{t("usedOk")}</span>}
        </div>
        <h3 className="text-2xl">
          <Link href={`/item/${item.id}`} className="no-underline hover:underline decoration-clay underline-offset-4" data-testid="item-name">
            {name}
          </Link>
        </h3>
        {item.price !== null && <p className="text-sm text-ink-soft">{formatSEK(item.price)}</p>}
        {notes && <p className="text-sm text-ink-soft">{notes}</p>}
        <div className="mt-auto pt-2">
          <ItemStatus status={item.status} />
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {available ? (
            <Link href={`/item/${item.id}`} className="btn btn-primary flex-1" data-testid="claim-link">
              {t("claim")}
            </Link>
          ) : (
            <span className="btn btn-secondary flex-1" aria-disabled="true">
              {t("taken")}
            </span>
          )}
          {item.storeUrl && (
            <a href={item.storeUrl} target="_blank" rel="noopener noreferrer" className="btn btn-secondary">
              {t("store")}
              <span aria-hidden="true">↗</span>
            </a>
          )}
        </div>
      </div>
    </article>
  );
}

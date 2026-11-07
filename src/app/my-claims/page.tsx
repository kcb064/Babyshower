import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { CopyLink } from "@/components/CopyLink";
import { ItemImage } from "@/components/ItemImage";
import { getDb } from "@/db";
import { listGuestClaims } from "@/db/queries";
import { formatDateTime, formatSEK } from "@/lib/format";
import { baseUrl, getGuest, guestLinkToken } from "@/lib/guest";
import { normalizeLocale, t2 } from "@/lib/i18n";
import { confirmContributionAction } from "../claimed/[id]/actions";
import { markPurchasedAction, releaseAction } from "./actions";

export default async function MyClaimsPage({ searchParams }: { searchParams: Promise<{ invalid?: string }> }) {
  const locale = normalizeLocale(await getLocale());
  const t = await getTranslations("myClaims");
  const tItem = await getTranslations("item");
  const { invalid } = await searchParams;
  const guest = await getGuest();
  const claims = guest ? listGuestClaims(getDb(), guest.gid) : [];
  const link = guest ? `${await baseUrl()}/my-claims/link?t=${encodeURIComponent(await guestLinkToken(guest))}` : null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
      <h1 className="text-5xl">{t("title")}</h1>
      <p className="mt-2 text-ink-soft">{t("intro")}</p>
      {invalid && (
        <p role="alert" className="mt-4 rounded-[var(--radius)] bg-clay-soft p-3 text-sm text-danger">
          {t("invalidLink")}
        </p>
      )}
      {claims.length === 0 ? (
        <div className="card mt-6 p-6 text-center">
          <p className="text-ink-soft">{t("empty")}</p>
          <Link href="/#lista" className="btn btn-primary mt-4">
            {tItem("back")}
          </Link>
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {claims.map((c) => {
            const name = t2(c.item.name, locale);
            if (c.amount !== null) {
              const confirmed = c.confirmedAt !== null;
              return (
                <li key={c.id} className="card flex gap-3 p-3 sm:gap-4 sm:p-4" data-testid="my-contribution">
                  <ItemImage
                    src={c.item.imageUrl}
                    alt=""
                    className="h-20 w-20 shrink-0 rounded-[var(--radius)] border border-line sm:h-24 sm:w-24"
                  />
                  <div className="min-w-0 flex-1">
                    <h2 className="text-2xl break-words">{name}</h2>
                    <p className="mt-0.5 font-semibold" data-testid="my-contribution-amount">
                      {t("contribution", { amount: formatSEK(c.amount) })}
                    </p>
                    <p className="mt-1 text-sm">
                      <span
                        className={`badge ${confirmed ? "bg-eucalyptus-soft text-eucalyptus-deep" : "bg-clay-soft text-clay-deep"}`}
                        data-testid="my-contribution-status"
                      >
                        {t(confirmed ? "status_confirmed" : "status_unconfirmed")}
                      </span>
                      {!confirmed && c.expiresAt && (
                        <span className="mt-1 block text-ink-soft sm:ml-2 sm:mt-0 sm:inline">
                          {t("unconfirmedHelp", { date: formatDateTime(c.expiresAt, locale) })}
                        </span>
                      )}
                    </p>
                    {!confirmed && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <form action={confirmContributionAction}>
                          <input type="hidden" name="claimId" value={c.id} />
                          <input type="hidden" name="from" value="my-claims" />
                          <button type="submit" className="btn btn-primary btn-small" data-testid="mark-sent">
                            {t("markSent")}
                          </button>
                        </form>
                        <Link href={`/claimed/${c.id}`} className="btn btn-secondary btn-small">
                          {t("swishDetails")}
                        </Link>
                      </div>
                    )}
                  </div>
                </li>
              );
            }
            return (
              <li key={c.id} className="card flex gap-3 p-3 sm:gap-4 sm:p-4" data-testid="my-claim">
                <ItemImage
                  src={c.item.imageUrl}
                  alt=""
                  className="h-20 w-20 shrink-0 rounded-[var(--radius)] border border-line sm:h-24 sm:w-24"
                />
                <div className="min-w-0 flex-1">
                  <h2 className="text-2xl break-words">
                    {c.qty > 1 ? `${c.qty} × ` : ""}
                    {name}
                  </h2>
                  <p className="mt-0.5 text-sm">
                    <span
                      className={`badge ${c.status === "purchased" ? "bg-eucalyptus-soft text-eucalyptus-deep" : "bg-clay-soft text-clay-deep"}`}
                      data-testid="my-claim-status"
                    >
                      {t(c.status === "purchased" ? "status_purchased" : "status_reserved")}
                    </span>
                    {c.status === "reserved" && c.expiresAt && (
                      <span className="mt-1 block text-ink-soft sm:ml-2 sm:mt-0 sm:inline">
                        {t("expires", { date: formatDateTime(c.expiresAt, locale) })}
                      </span>
                    )}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {c.status === "reserved" && (
                      <form action={markPurchasedAction}>
                        <input type="hidden" name="claimId" value={c.id} />
                        <button type="submit" className="btn btn-primary btn-small">
                          {t("markPurchased")}
                        </button>
                      </form>
                    )}
                    <form action={releaseAction}>
                      <input type="hidden" name="claimId" value={c.id} />
                      <button type="submit" className="btn btn-secondary btn-small" data-testid="release-claim">
                        {t("release")}
                      </button>
                    </form>
                    {c.item.storeUrl && (
                      <a href={c.item.storeUrl} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-small">
                        {tItem("store")} ↗
                      </a>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {link && claims.length > 0 && (
        <section className="mt-8 rounded-[var(--radius)] bg-linen-deep p-4">
          <h2 className="text-2xl">{t("linkTitle")}</h2>
          <p className="mb-3 mt-1 text-sm text-ink-soft">{t("linkHelp")}</p>
          <CopyLink
            url={link}
            label={(await getTranslations("confirm"))("copy")}
            copiedLabel={(await getTranslations("confirm"))("copied")}
          />
        </section>
      )}
    </div>
  );
}

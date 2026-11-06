import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { CopyLink } from "@/components/CopyLink";
import { EucalyptusBranch } from "@/components/Botanical";
import { getDb } from "@/db";
import { getGuestClaim } from "@/db/queries";
import { formatDateTime } from "@/lib/format";
import { baseUrl, getGuest, guestLinkToken } from "@/lib/guest";
import { normalizeLocale, t2 } from "@/lib/i18n";

export default async function ClaimedPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guest = await getGuest();
  if (!guest || !/^\d+$/.test(id)) notFound();
  const claim = getGuestClaim(getDb(), Number(id), guest.gid);
  if (!claim) notFound();
  const locale = normalizeLocale(await getLocale());
  const t = await getTranslations("confirm");
  const name = t2(claim.item.name, locale);
  const link = `${await baseUrl()}/my-claims/link?t=${encodeURIComponent(await guestLinkToken(guest))}`;

  return (
    <div className="mx-auto max-w-xl px-4 py-8 sm:py-14">
      <div className="card fade-in relative overflow-hidden p-6 sm:p-8" data-testid="claim-confirmation">
        <EucalyptusBranch className="pointer-events-none absolute -right-8 -top-6 h-40 text-eucalyptus" />
        <h1 className="relative text-5xl">{t("title")}</h1>
        <p className="relative mt-4 text-lg" data-testid="confirm-text">
          {claim.status === "purchased" ? t("purchased", { qty: claim.qty, name }) : t("reserved", { qty: claim.qty, name })}
        </p>
        {claim.status === "reserved" && claim.expiresAt && (
          <p className="mt-2 text-ink-soft">{t("expires", { date: formatDateTime(claim.expiresAt, locale) })}</p>
        )}
        {claim.item.storeUrl && (
          <a href={claim.item.storeUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary mt-6 w-full sm:w-auto">
            {t("store")} <span aria-hidden="true">↗</span>
          </a>
        )}
        <section className="mt-8 rounded-[var(--radius)] bg-linen p-4">
          <h2 className="text-2xl">{t("linkTitle")}</h2>
          <p className="mb-3 mt-1 text-sm text-ink-soft">{t("linkHelp")}</p>
          <CopyLink url={link} label={t("copy")} copiedLabel={t("copied")} />
        </section>
        <div className="mt-6 flex flex-wrap gap-2">
          <Link href="/my-claims" className="btn btn-secondary">
            {t("myClaims")}
          </Link>
          <Link href="/#lista" className="btn btn-ghost">
            {t("back")}
          </Link>
        </div>
      </div>
    </div>
  );
}

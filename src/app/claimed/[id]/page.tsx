import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import QRCode from "qrcode";
import { CopyLink } from "@/components/CopyLink";
import { CopyText } from "@/components/CopyText";
import { EucalyptusBranch } from "@/components/Botanical";
import { getDb } from "@/db";
import { getGuestClaim, getRegistry, releaseExpired, type GuestClaim } from "@/db/queries";
import { formatDateTime, formatSEK } from "@/lib/format";
import { baseUrl, getGuest, guestLinkToken } from "@/lib/guest";
import { normalizeLocale, t2, type Locale } from "@/lib/i18n";
import { buildSwishPayload, buildSwishQrText, buildSwishUrl, formatSwishNumber, swishMessage } from "@/lib/swish";
import { confirmContributionAction } from "./actions";

export default async function ClaimedPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guest = await getGuest();
  if (!guest || !/^\d+$/.test(id)) notFound();
  const db = getDb();
  releaseExpired(db);
  const claim = getGuestClaim(db, Number(id), guest.gid);
  if (!claim) notFound();
  const locale = normalizeLocale(await getLocale());
  const t = await getTranslations("confirm");
  const name = t2(claim.item.name, locale);
  const link = `${await baseUrl()}/my-claims/link?t=${encodeURIComponent(await guestLinkToken(guest))}`;
  const isContribution = claim.amount !== null;

  return (
    <div className="mx-auto max-w-xl px-4 py-8 sm:py-14">
      <div className="card fade-in relative overflow-hidden p-5 sm:p-8" data-testid="claim-confirmation">
        <EucalyptusBranch className="pointer-events-none absolute -right-8 -top-6 h-40 text-eucalyptus" />
        {isContribution ? (
          <SwishSection claim={claim} name={name} locale={locale} swishNumber={getRegistry(db).swishNumber} />
        ) : (
          <>
            <h1 className="relative text-5xl">{t("title")}</h1>
            <p className="relative mt-4 text-lg" data-testid="confirm-text">
              {claim.status === "purchased" ? t("purchased", { qty: claim.qty, name }) : t("reserved", { qty: claim.qty, name })}
            </p>
            {claim.status === "reserved" && claim.expiresAt && (
              <p className="mt-2 text-ink-soft">{t("expires", { date: formatDateTime(claim.expiresAt, locale) })}</p>
            )}
            {claim.item.storeUrl && (
              <a
                href={claim.item.storeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary mt-6 w-full sm:w-auto"
              >
                {t("store")} <span aria-hidden="true">↗</span>
              </a>
            )}
          </>
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

async function SwishSection({
  claim,
  name,
  locale,
  swishNumber,
}: {
  claim: GuestClaim;
  name: string;
  locale: Locale;
  swishNumber: string | null;
}) {
  const t = await getTranslations("swish");
  const amount = claim.amount ?? 0;
  const amountText = formatSEK(amount);

  if (claim.status === "released") {
    return (
      <>
        <h1 className="relative text-4xl">{t("title")}</h1>
        <p className="relative mt-4" data-testid="swish-expired">
          {t("expired")}
        </p>
      </>
    );
  }
  if (claim.confirmedAt) {
    return (
      <>
        <h1 className="relative text-4xl sm:text-5xl">{t("confirmedTitle")}</h1>
        <p className="relative mt-4 text-lg" data-testid="swish-confirmed">
          {t("confirmedText", { amount: amountText, name })}
        </p>
      </>
    );
  }
  if (!swishNumber) {
    return (
      <>
        <h1 className="relative text-4xl">{t("title")}</h1>
        <p className="relative mt-4">{t("missing")}</p>
      </>
    );
  }

  const message = swishMessage(name, locale);
  const url = buildSwishUrl({ payee: swishNumber, amount, message });
  const payload = buildSwishPayload({ payee: swishNumber, amount, message });
  const qrText = buildSwishQrText({ payee: swishNumber, amount, message });
  const svg = await QRCode.toString(qrText, {
    type: "svg",
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#2b2b2b", light: "#ffffff" },
  });
  const qrSrc = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

  return (
    <>
      <h1 className="relative text-4xl sm:text-5xl">{t("title")}</h1>
      <p className="relative mt-3 pr-10 text-lg" data-testid="swish-intro">
        {t("intro", { amount: amountText, name })}
      </p>
      <a href={url} className="btn btn-primary relative mt-5 w-full text-base" data-testid="swish-link">
        {t("open")}
      </a>
      <p className="help text-center">{t("openHelp")}</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-[auto_1fr] sm:items-center">
        <img
          src={qrSrc}
          alt={t("qrAlt", { amount: amountText })}
          width={176}
          height={176}
          className="mx-auto h-44 w-44 rounded-[var(--radius)] border border-line bg-white p-1 sm:mx-0"
          data-testid="swish-qr"
        />
        <div className="text-center sm:text-left">
          <h2 className="text-2xl">{t("qrTitle")}</h2>
          <p className="mt-1 text-sm text-ink-soft">{t("qrHelp")}</p>
        </div>
      </div>

      <section className="mt-6 rounded-[var(--radius)] border border-line p-4" aria-labelledby="swish-manual">
        <h2 id="swish-manual" className="text-2xl">
          {t("manualTitle")}
        </h2>
        <dl className="mt-3 space-y-3 text-sm">
          <div>
            <dt className="text-ink-soft">{t("number")}</dt>
            <dd className="mt-0.5">
              <CopyText
                value={payload.payee.value}
                display={formatSwishNumber(payload.payee.value)}
                label={t("copyNumber")}
                copiedLabel={t("copied")}
                testId="swish-number"
              />
            </dd>
          </div>
          <div className="flex flex-wrap gap-x-8 gap-y-3">
            <div>
              <dt className="text-ink-soft">{t("amount")}</dt>
              <dd className="mt-0.5 text-lg font-semibold">{amountText}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-ink-soft">{t("message")}</dt>
              <dd className="mt-0.5 break-words font-medium">{payload.message.value}</dd>
            </div>
          </div>
        </dl>
      </section>

      <form action={confirmContributionAction} className="mt-6">
        <input type="hidden" name="claimId" value={claim.id} />
        <button type="submit" className="btn btn-primary w-full text-base" data-testid="swish-sent">
          {t("sent")}
        </button>
        <p className="help mt-2">{t("sentHelp")}</p>
      </form>
    </>
  );
}

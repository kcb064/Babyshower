import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { getDb } from "@/db";
import { getRegistry } from "@/db/queries";
import { formatDateTime, formatRelative } from "@/lib/format";
import { normalizeLocale } from "@/lib/i18n";
import { PeekForm, RevealForm } from "./RevealForms";

export const dynamic = "force-dynamic";

export default async function RevealPage() {
  const locale = normalizeLocale(await getLocale());
  const t = await getTranslations("admin.reveal");
  const registry = getRegistry(getDb());
  const now = new Date();

  return (
    <div className="space-y-8 py-6">
      <div>
        <h1 className="text-5xl">{t("title")}</h1>
        <p className="mt-2 max-w-2xl text-ink-soft">{t("intro")}</p>
      </div>

      {registry.revealed ? (
        <section className="card space-y-3 p-4 sm:p-6" data-testid="reveal-done">
          <h2 className="text-3xl">{t("doneTitle")}</h2>
          <p>
            {t("doneText", {
              name: registry.revealedBy ?? "?",
              when: registry.revealedAt ? formatDateTime(registry.revealedAt, locale) : "",
            })}
          </p>
          <Link href="/admin/gifts" className="btn btn-primary">
            {t("toGifts")}
          </Link>
        </section>
      ) : (
        <>
          <section aria-labelledby="peek-title" className="card space-y-3 p-4 sm:p-6">
            <h2 id="peek-title" className="text-3xl">
              {t("peekTitle")}
            </h2>
            <p className="text-ink-soft">{t("peekText")}</p>
            {registry.lastPeekAt && registry.lastPeekBy && (
              <p className="text-sm" data-testid="last-peek">
                {t("lastPeek", { name: registry.lastPeekBy, when: formatRelative(registry.lastPeekAt, now, locale) })}
              </p>
            )}
            <PeekForm />
          </section>

          <section aria-labelledby="reveal-title" className="card space-y-3 border-clay p-4 sm:p-6">
            <h2 id="reveal-title" className="text-3xl">
              {t("revealTitle")}
            </h2>
            <p className="text-ink-soft">{t("revealText")}</p>
            <RevealForm />
          </section>
        </>
      )}
    </div>
  );
}

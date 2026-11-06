import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { setLocale } from "@/app/actions";
import { locales } from "@/lib/i18n";

export async function Header() {
  const t = await getTranslations("header");
  const locale = await getLocale();
  return (
    <header className="border-b border-line bg-linen/95 backdrop-blur supports-[backdrop-filter]:bg-linen/80 sticky top-0 z-20">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 btn btn-secondary btn-small">
        {t("skip")}
      </a>
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-2.5">
        <Link href="/" className="font-heading text-xl no-underline sm:text-2xl" data-testid="header-home">
          {t("home")}
        </Link>
        <nav className="flex items-center gap-1 sm:gap-3">
          <Link href="/my-claims" className="btn btn-ghost text-sm font-medium" data-testid="nav-my-claims">
            {t("myClaims")}
          </Link>
          <form action={setLocale} className="flex items-center" aria-label={t("language")}>
            {locales.map((l, i) => (
              <span key={l} className="flex items-center">
                {i > 0 && <span className="px-0.5 text-ink-soft" aria-hidden="true">|</span>}
                <button
                  type="submit"
                  name="locale"
                  value={l}
                  lang={l}
                  aria-pressed={locale === l}
                  data-testid={`lang-${l}`}
                  className={`min-h-9 min-w-9 rounded-[var(--radius)] px-1.5 text-sm font-semibold uppercase tracking-wide ${
                    locale === l ? "text-ink underline decoration-clay decoration-2 underline-offset-4" : "text-ink-soft hover:text-ink"
                  }`}
                >
                  {l.toUpperCase()}
                </button>
              </span>
            ))}
          </form>
        </nav>
      </div>
    </header>
  );
}

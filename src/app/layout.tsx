import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { Header } from "@/components/Header";
import { getDb } from "@/db";
import { getRegistry } from "@/db/queries";
import { normalizeLocale, t2 } from "@/lib/i18n";
import "./globals.css";

export const dynamic = "force-dynamic";

// Self-hosted variable fonts (SIL Open Font License, via fontsource) so the build never needs
// to reach Google Fonts. Latin + Latin Extended cover Swedish and English.
const cormorant = localFont({
  src: [
    { path: "../fonts/cormorant-garamond-latin-wght-normal.woff2", weight: "300 700", style: "normal" },
    { path: "../fonts/cormorant-garamond-latin-ext-wght-normal.woff2", weight: "300 700", style: "normal" },
    { path: "../fonts/cormorant-garamond-latin-wght-italic.woff2", weight: "300 700", style: "italic" },
  ],
  variable: "--font-cormorant",
  display: "swap",
});

const workSans = localFont({
  src: [
    { path: "../fonts/work-sans-latin-wght-normal.woff2", weight: "100 900", style: "normal" },
    { path: "../fonts/work-sans-latin-ext-wght-normal.woff2", weight: "100 900", style: "normal" },
    { path: "../fonts/work-sans-latin-wght-italic.woff2", weight: "100 900", style: "italic" },
  ],
  variable: "--font-work-sans",
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const locale = normalizeLocale(await getLocale());
  const t = await getTranslations("meta");
  const registry = getRegistry(getDb());
  return {
    title: t2(registry.title, locale),
    description: t("description"),
    robots: { index: false, follow: false },
  };
}

export const viewport: Viewport = {
  themeColor: "#8fa98f",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale} data-theme="botanist" className={`${cormorant.variable} ${workSans.variable}`}>
      <body className="min-h-dvh">
        <NextIntlClientProvider>
          <Header />
          <main id="main">{children}</main>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}

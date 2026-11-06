import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Work_Sans } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { Header } from "@/components/Header";
import { getDb } from "@/db";
import { getRegistry } from "@/db/queries";
import { normalizeLocale, t2 } from "@/lib/i18n";
import "./globals.css";

export const dynamic = "force-dynamic";

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-cormorant",
  display: "swap",
});

const workSans = Work_Sans({
  subsets: ["latin"],
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

import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireEditor } from "@/lib/auth";
import { signOut } from "../sign-in/actions";
import { AdminNav } from "./AdminNav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const editor = await requireEditor();
  const t = await getTranslations("admin");
  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3 text-sm">
        <span className="text-ink-soft" data-testid="admin-signed-in">
          {t("signedInAs", { name: editor.name })}
        </span>
        <div className="flex items-center gap-2">
          <Link href="/" className="btn btn-ghost btn-small">
            {t("viewPublic")}
          </Link>
          <form action={signOut}>
            <button type="submit" className="btn btn-secondary btn-small">
              {t("signOut")}
            </button>
          </form>
        </div>
      </div>
      <AdminNav
        label={t("title")}
        links={[
          { href: "/admin", text: t("nav.dashboard"), testId: "admin-nav-dashboard" },
          { href: "/admin/gifts", text: t("nav.gifts"), testId: "admin-nav-gifts" },
          { href: "/admin/reveal", text: t("nav.reveal"), testId: "admin-nav-reveal" },
          { href: "/admin/starter", text: t("nav.starter"), testId: "admin-nav-starter" },
        ]}
      />
      {children}
    </div>
  );
}

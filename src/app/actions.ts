"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { LOCALE_COOKIE, normalizeLocale } from "@/lib/i18n";

export async function setLocale(formData: FormData) {
  const locale = normalizeLocale(formData.get("locale"));
  (await cookies()).set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 365 * 24 * 60 * 60,
    sameSite: "lax",
  });
  revalidatePath("/", "layout");
}

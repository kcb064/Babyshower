"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { createClaim, getRegistry } from "@/db/queries";
import { getGuest, newGuestId, setGuestCookie } from "@/lib/guest";
import { t2 } from "@/lib/i18n";
import { ntfyMessage, sendNtfy } from "@/lib/ntfy";
import { claimSchema, formToObject } from "@/lib/validation";

export interface ClaimFormState {
  errors?: Partial<Record<"name" | "email" | "qty" | "form", string>>;
  max?: number;
  values?: Record<string, string>;
}

export async function claimItem(_prev: ClaimFormState, formData: FormData): Promise<ClaimFormState> {
  const raw = formToObject(formData);
  const parsed = claimSchema.safeParse(raw);
  if (!parsed.success) {
    const errors: ClaimFormState["errors"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (key === "name" || key === "email" || key === "qty") errors[key] = key;
      else errors.form = "generic";
    }
    return { errors, values: raw };
  }
  const input = parsed.data;
  const existing = await getGuest();
  const guest = { gid: existing?.gid ?? newGuestId(), email: input.email.toLowerCase() };

  const db = getDb();
  const result = createClaim(db, {
    itemId: input.itemId,
    guestKey: guest.gid,
    guestName: input.name,
    guestEmail: guest.email,
    qty: input.qty,
    message: input.message,
    showName: input.showName,
    address: input.address,
    purchased: input.purchased,
  });
  if (!result.ok) {
    if (result.reason === "not_found") return { errors: { form: "notFound" }, values: raw };
    if (result.reason === "invalid") return { errors: { qty: "qty" }, max: result.remaining, values: raw };
    return { errors: { form: "unavailable" }, max: result.remaining, values: raw };
  }

  await setGuestCookie(guest);
  const registry = getRegistry(db);
  sendNtfy(
    ntfyMessage({
      event: input.purchased ? "purchased" : "claim",
      itemName: t2(result.item.name, "sv"),
      claimed: result.claimedAfter,
      total: result.item.qtyWanted,
      guestName: input.name,
      revealed: registry.revealed,
    }),
  );
  revalidatePath("/");
  redirect(`/claimed/${result.claim.id}`);
}

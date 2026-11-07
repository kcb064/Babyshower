"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { createClaim, createContribution, getRegistry } from "@/db/queries";
import { getGuest, newGuestId, setGuestCookie } from "@/lib/guest";
import { t2 } from "@/lib/i18n";
import { ntfyMessage, sendNtfy } from "@/lib/ntfy";
import { claimSchema, contributionSchema, formToObject } from "@/lib/validation";

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
      itemName: t2(result.item.name, "en"),
      claimed: result.claimedAfter,
      total: result.item.qtyWanted,
      guestName: input.name,
      revealed: registry.revealed,
    }),
  );
  revalidatePath("/");
  redirect(`/claimed/${result.claim.id}`);
}

export interface ContributionFormState {
  errors?: Partial<Record<"name" | "email" | "amount" | "form", string>>;
  values?: Record<string, string>;
}

/** Record a Swish contribution (unconfirmed) and continue to the Swish page. */
export async function contribute(_prev: ContributionFormState, formData: FormData): Promise<ContributionFormState> {
  const raw = formToObject(formData);
  const parsed = contributionSchema.safeParse(raw);
  if (!parsed.success) {
    const errors: ContributionFormState["errors"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (key === "name" || key === "email" || key === "amount") errors[key] = key;
      else errors.form = "generic";
    }
    return { errors, values: raw };
  }
  const input = parsed.data;
  const db = getDb();
  if (!getRegistry(db).swishNumber) return { errors: { form: "noSwish" }, values: raw };
  const existing = await getGuest();
  const guest = { gid: existing?.gid ?? newGuestId(), email: input.email.toLowerCase() };
  const result = createContribution(db, {
    itemId: input.itemId,
    guestKey: guest.gid,
    guestName: input.name,
    guestEmail: guest.email,
    amount: input.amount,
    message: input.message,
    showName: input.showName,
  });
  if (!result.ok) {
    if (result.reason === "invalid") return { errors: { amount: "amount" }, values: raw };
    return { errors: { form: result.reason === "not_found" ? "notFound" : "unavailable" }, values: raw };
  }
  await setGuestCookie(guest);
  revalidatePath("/my-claims");
  redirect(`/claimed/${result.claim.id}`);
}

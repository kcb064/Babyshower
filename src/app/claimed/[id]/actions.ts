"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { confirmContribution, getRegistry } from "@/db/queries";
import { getGuest } from "@/lib/guest";
import { t2 } from "@/lib/i18n";
import { ntfyContributionMessage, sendNtfy } from "@/lib/ntfy";

/** Guest says "I've sent it": the contribution counts from now on, and the owners get a push. */
export async function confirmContributionAction(formData: FormData) {
  const guest = await getGuest();
  const id = Number(formData.get("claimId"));
  if (!guest || !Number.isInteger(id) || id < 1) return;
  const db = getDb();
  const result = confirmContribution(db, id, guest.gid);
  if (result.ok) {
    sendNtfy(
      ntfyContributionMessage({
        itemName: t2(result.claim.item.name, "en"),
        amount: result.claim.amount ?? 0,
        confirmed: result.totals.confirmed,
        goal: result.totals.goal,
        guestName: result.claim.guestName,
        revealed: getRegistry(db).revealed,
      }),
    );
  }
  revalidatePath("/");
  revalidatePath("/my-claims");
  revalidatePath(`/claimed/${id}`);
  if (formData.get("from") === "my-claims") return;
  redirect(`/claimed/${id}`);
}

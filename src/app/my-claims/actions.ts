"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { getRegistry, markClaimPurchased, releaseGuestClaim } from "@/db/queries";
import { getGuest } from "@/lib/guest";
import { t2 } from "@/lib/i18n";
import { ntfyMessage, sendNtfy } from "@/lib/ntfy";

async function change(formData: FormData, kind: "purchased" | "released") {
  const guest = await getGuest();
  const id = Number(formData.get("claimId"));
  if (!guest || !Number.isInteger(id)) return;
  const db = getDb();
  const result = kind === "purchased" ? markClaimPurchased(db, id, guest.gid) : releaseGuestClaim(db, id, guest.gid);
  if (!result.ok) return;
  sendNtfy(
    ntfyMessage({
      event: kind,
      itemName: t2(result.claim.item.name, "en"),
      claimed: result.claimedAfter,
      total: result.claim.item.qtyWanted,
      guestName: result.claim.guestName,
      revealed: getRegistry(db).revealed,
    }),
  );
  revalidatePath("/my-claims");
  revalidatePath("/");
}

export async function markPurchasedAction(formData: FormData) {
  await change(formData, "purchased");
}

export async function releaseAction(formData: FormData) {
  await change(formData, "released");
}

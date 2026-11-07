"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { setThanked } from "@/db/gifts";
import { logEdit } from "@/db/queries";
import { requireEditor } from "@/lib/auth";

export async function setThankedAction(formData: FormData) {
  const editor = await requireEditor();
  const claimId = Number(formData.get("claimId"));
  if (!Number.isInteger(claimId) || claimId < 1) return;
  const thanked = formData.get("thanked") === "1";
  const rawNote = formData.get("note");
  const note = typeof rawNote === "string" && rawNote.trim() ? rawNote.trim().slice(0, 300) : null;
  const db = getDb();
  const res = setThanked(db, claimId, thanked, note);
  if (!res.ok) return;
  logEdit(
    db,
    editor.name,
    thanked
      ? `Marked the gift from ${res.guestName} ("${res.itemName}") as thanked${note ? `: ${note}` : ""}`
      : `Removed the thank-you mark for ${res.guestName} ("${res.itemName}")`,
  );
  revalidatePath("/admin/gifts");
}

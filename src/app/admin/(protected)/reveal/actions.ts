"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { groupGifts, isRevealConfirmation, peekGifts, revealRegistry, type GiftGroup } from "@/db/gifts";
import { getRegistry } from "@/db/queries";
import { requireEditor } from "@/lib/auth";
import { sendNtfy } from "@/lib/ntfy";

export interface RevealState {
  error?: "confirm";
  at?: number;
}

export async function revealAction(_prev: RevealState, formData: FormData): Promise<RevealState> {
  const editor = await requireEditor();
  if (!isRevealConfirmation(formData.get("confirm"))) return { error: "confirm", at: Date.now() };
  const res = revealRegistry(getDb(), editor.name);
  if (res.ok) sendNtfy(`The registry was revealed by ${editor.name}`);
  revalidatePath("/admin", "layout");
  redirect("/admin/gifts");
}

export type PeekState =
  | { status: "idle" }
  | { status: "needsConfirm"; at: number }
  | { status: "shown"; groups: GiftGroup[]; by: string; at: number };

/**
 * One-time look at the full list. The list travels only in this action's response (a POST that
 * nothing caches) and is gone on reload; `revealed` is never changed.
 */
export async function peekAction(_prev: PeekState, formData: FormData): Promise<PeekState> {
  const editor = await requireEditor();
  if (formData.get("understand") !== "on") return { status: "needsConfirm", at: Date.now() };
  const db = getDb();
  if (getRegistry(db).revealed) redirect("/admin/gifts");
  const rows = peekGifts(db, editor.name);
  revalidatePath("/admin", "layout");
  return { status: "shown", groups: groupGifts(db, rows), by: editor.name, at: Date.now() };
}

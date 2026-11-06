"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { clearEditorCookie, getEditor, passcodeMatches, setEditorCookie } from "@/lib/auth";
import { serverEnv } from "@/lib/env";
import { clientIp } from "@/lib/guest";
import { RateLimiter } from "@/lib/rate-limit";

const globalForLimiter = globalThis as unknown as { __signInLimiter?: RateLimiter };
const limiter = (globalForLimiter.__signInLimiter ??= new RateLimiter(10, 15 * 60 * 1000));

export interface SignInState {
  error?: "wrong" | "rateLimited" | "name";
}

export async function signIn(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const ip = await clientIp();
  if (!limiter.attempt(ip)) return { error: "rateLimited" };
  const passcode = String(formData.get("passcode") ?? "");
  if (!passcodeMatches(passcode, serverEnv().editorPasscode)) return { error: "wrong" };
  await setEditorCookie(null);
  redirect("/admin/sign-in");
}

const nameSchema = z.string().trim().min(1).max(40);

export async function setDisplayName(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const editor = await getEditor();
  if (!editor) redirect("/admin/sign-in");
  const parsed = nameSchema.safeParse(formData.get("name"));
  if (!parsed.success) return { error: "name" };
  await setEditorCookie(parsed.data);
  redirect("/admin");
}

export async function signOut() {
  await clearEditorCookie();
  redirect("/admin/sign-in");
}

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createHash, timingSafeEqual } from "node:crypto";
import { serverEnv } from "./env";
import { secureCookieFlag } from "./cookies";
import { signToken, verifyToken } from "./signing";

export { EDITOR_COOKIE } from "./auth-constants";
import { EDITOR_COOKIE } from "./auth-constants";
export const EDITOR_MAX_AGE = 90 * 24 * 60 * 60;

export interface EditorSession {
  kind: "editor";
  name: string | null;
}

export function passcodeMatches(input: string, expected: string): boolean {
  if (!expected) return false;
  const a = createHash("sha256").update(input).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export async function readEditorToken(token: string | undefined): Promise<EditorSession | null> {
  const p = await verifyToken(token, serverEnv().cookieSecret);
  if (!p || p.kind !== "editor") return null;
  return { kind: "editor", name: typeof p.name === "string" && p.name ? p.name : null };
}

export async function getEditor(): Promise<EditorSession | null> {
  const store = await cookies();
  return readEditorToken(store.get(EDITOR_COOKIE)?.value);
}

/** For pages and actions under /admin: must be signed in and have a display name. */
export async function requireEditor(): Promise<{ name: string }> {
  const editor = await getEditor();
  if (!editor || !editor.name) redirect("/admin/sign-in");
  return { name: editor.name };
}

export async function setEditorCookie(name: string | null) {
  const env = serverEnv();
  const token = await signToken({ kind: "editor", name }, env.cookieSecret, EDITOR_MAX_AGE);
  const store = await cookies();
  store.set(EDITOR_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: await secureCookieFlag(),
    path: "/",
    maxAge: EDITOR_MAX_AGE,
  });
}

export async function clearEditorCookie() {
  (await cookies()).delete(EDITOR_COOKIE);
}

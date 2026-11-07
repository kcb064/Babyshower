"use server";

import { z } from "zod";
import { getDb } from "@/db";
import { logEdit } from "@/db/queries";
import { requireEditor } from "@/lib/auth";
import { RateLimiter } from "@/lib/rate-limit";
import {
  MAX_TEXT_CHARS,
  planTranslation,
  resolveProvider,
  translateTexts,
  TranslateError,
  type Lang,
  type PlannedTranslation,
  type TranslateErrorCode,
} from "@/lib/translate";

export type TranslateResult =
  | { ok: true; filled: Record<string, { en?: string; sv?: string }> }
  | { ok: false; error: TranslateErrorCode };

const pairsSchema = z
  .array(
    z.object({
      key: z.string().min(1).max(64),
      en: z.string().max(MAX_TEXT_CHARS),
      sv: z.string().max(MAX_TEXT_CHARS),
    }),
  )
  .max(200);

// 30 calls per 10 minutes for the whole process (one container), shared across hot reloads.
const globalForTranslate = globalThis as unknown as { __translateLimiter?: RateLimiter };
const limiter = (globalForTranslate.__translateLimiter ??= new RateLimiter(30, 10 * 60 * 1000));

export async function translateFields(formData: FormData): Promise<TranslateResult> {
  const editor = await requireEditor();
  const provider = resolveProvider(process.env);
  if (provider === "none") return { ok: false, error: "no_provider" };

  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("pairs") ?? "[]"));
  } catch {
    return { ok: false, error: "provider_error" };
  }
  const parsed = pairsSchema.safeParse(raw);
  if (!parsed.success) {
    const tooLong = parsed.error.issues.some((i) => i.code === "too_big" && i.path.length > 1);
    return { ok: false, error: tooLong ? "too_long" : "provider_error" };
  }

  const plan = planTranslation(parsed.data);
  if (plan.length === 0) return { ok: true, filled: {} };
  if (!limiter.attempt("translate")) return { ok: false, error: "rate_limited" };

  const filled: Record<string, { en?: string; sv?: string }> = {};
  try {
    for (const from of ["en", "sv"] as const) {
      const batch: PlannedTranslation[] = plan.filter((p) => p.from === from);
      if (batch.length === 0) continue;
      const to: Lang = from === "en" ? "sv" : "en";
      const out = await translateTexts(
        batch.map((p) => p.source),
        from,
        to,
        { provider },
      );
      batch.forEach((p, i) => {
        filled[p.key] = { ...filled[p.key], [to]: out[i] };
      });
    }
  } catch (err) {
    if (err instanceof TranslateError) {
      console.warn(`[translate] ${provider}: ${err.code}: ${err.message}`);
      return { ok: false, error: err.code };
    }
    console.error("[translate] unexpected error", err);
    return { ok: false, error: "provider_error" };
  }

  logEdit(getDb(), editor.name, `Auto-translated ${plan.length} field(s) (${provider})`);
  return { ok: true, filled };
}

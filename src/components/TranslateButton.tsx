"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { translateFields, type TranslateResult } from "@/app/admin/(protected)/translate-actions";

export interface TranslatePair {
  key: string;
  enId: string;
  svId: string;
}

type Lang = "en" | "sv";

interface Props {
  pairs: TranslatePair[];
  /**
   * Called for each filled value. Return true when the caller has handled it (e.g. by updating
   * React state for a controlled field); otherwise the value is written straight into the input.
   */
  onFilled?: (key: string, lang: Lang, value: string) => boolean | void;
  className?: string;
  testId?: string;
}

type Status =
  | { kind: "idle" }
  | { kind: "done"; count: number }
  | { kind: "nothing" }
  | { kind: "error"; code: Exclude<TranslateResult, { ok: true }>["error"] };

type Field = HTMLInputElement | HTMLTextAreaElement;

function field(id: string): Field | null {
  const el = document.getElementById(id);
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement ? el : null;
}

const valueOf = (id: string) => field(id)?.value ?? "";
const isBlank = (s: string) => s.trim() === "";

/** Set an input's value so React (controlled or not) sees the change. */
function writeValue(el: Field, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

function translatable(pairs: TranslatePair[]): boolean {
  return pairs.some((p) => isBlank(valueOf(p.enId)) !== isBlank(valueOf(p.svId)));
}

export function TranslateButton({ pairs, onFilled, className, testId = "translate-button" }: Props) {
  const t = useTranslations("admin.translate");
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [canTranslate, setCanTranslate] = useState(false);

  const recheck = useCallback(() => setCanTranslate(translatable(pairs)), [pairs]);

  useEffect(() => {
    recheck();
    const ids = new Set(pairs.flatMap((p) => [p.enId, p.svId]));
    const onInput = (e: Event) => {
      if (e.target instanceof HTMLElement && ids.has(e.target.id)) recheck();
    };
    document.addEventListener("input", onInput, true);
    return () => document.removeEventListener("input", onInput, true);
  }, [pairs, recheck]);

  // Controlled fields filled via onFilled only reach the DOM on commit, so re-check after it.
  useEffect(recheck, [status, recheck]);

  function onClick() {
    const values = pairs.map((p) => ({ key: p.key, en: valueOf(p.enId), sv: valueOf(p.svId) }));
    if (!values.some((v) => isBlank(v.en) !== isBlank(v.sv))) {
      setStatus({ kind: "nothing" });
      return;
    }
    startTransition(async () => {
      const fd = new FormData();
      fd.set("pairs", JSON.stringify(values));
      let res: TranslateResult;
      try {
        res = await translateFields(fd);
      } catch {
        res = { ok: false, error: "provider_error" };
      }
      if (!res.ok) {
        setStatus({ kind: "error", code: res.error });
        return;
      }
      let count = 0;
      for (const p of pairs) {
        const got = res.filled[p.key];
        if (!got) continue;
        for (const lang of ["en", "sv"] as const) {
          const value = got[lang];
          const id = lang === "en" ? p.enId : p.svId;
          const el = field(id);
          // Re-check at write time: never overwrite something typed while the request was running.
          if (value === undefined || !el || !isBlank(el.value)) continue;
          if (!onFilled?.(p.key, lang, value)) writeValue(el, value);
          count++;
        }
      }
      setStatus(count ? { kind: "done", count } : { kind: "nothing" });
    });
  }

  const errorText =
    status.kind === "error"
      ? {
          no_provider: t("errorNoProvider"),
          provider_error: t("errorProvider"),
          too_long: t("errorTooLong"),
          rate_limited: t("errorRateLimited"),
        }[status.code]
      : null;

  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 ${className ?? ""}`}>
      <button
        type="button"
        className="btn btn-secondary btn-small"
        onClick={onClick}
        disabled={pending || !canTranslate}
        title={t("help")}
        aria-describedby={`${testId}-help`}
        data-testid={testId}
      >
        {pending ? t("pending") : t("button")}
      </button>
      <p id={`${testId}-help`} className="help m-0">
        {t("help")}
      </p>
      <p aria-live="polite" className="w-full text-sm" data-testid={`${testId}-status`}>
        {status.kind === "done" && <span className="text-eucalyptus-deep">{t("done", { count: status.count })}</span>}
        {status.kind === "nothing" && <span className="text-ink-soft">{t("nothing")}</span>}
        {errorText && <span className="text-danger">{errorText}</span>}
      </p>
    </div>
  );
}

"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { GiftList } from "@/components/GiftList";
import { peekAction, revealAction, type PeekState, type RevealState } from "./actions";

export function RevealForm() {
  const t = useTranslations("admin.reveal");
  const [state, action, pending] = useActionState<RevealState, FormData>(revealAction, {});
  return (
    <form action={action} className="space-y-3" data-testid="reveal-form">
      <div>
        <label htmlFor="reveal-confirm" className="label">
          {t("confirmLabel")}
        </label>
        <input
          id="reveal-confirm"
          name="confirm"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          className="field"
          aria-describedby="reveal-confirm-help"
          aria-invalid={state.error ? true : undefined}
        />
        <p id="reveal-confirm-help" className="help mt-1">
          {t("confirmHelp")}
        </p>
      </div>
      {state.error && (
        <p className="text-sm font-medium text-danger" role="alert" key={state.at} data-testid="reveal-error">
          {t("confirmError")}
        </p>
      )}
      <button type="submit" className="btn btn-primary" disabled={pending} data-testid="reveal-submit">
        {t("revealSubmit")}
      </button>
    </form>
  );
}

export function PeekForm() {
  const t = useTranslations("admin.reveal");
  const [state, action, pending] = useActionState<PeekState, FormData>(peekAction, { status: "idle" });
  if (state.status === "shown") {
    return (
      <div className="space-y-3" data-testid="peek-result">
        <p className="rounded-[var(--radius)] border border-clay bg-clay-soft p-3 text-sm" role="status">
          {t("peekShown")}
        </p>
        <GiftList groups={state.groups} />
      </div>
    );
  }
  return (
    <form action={action} className="space-y-3" data-testid="peek-form">
      <label className="flex min-h-11 cursor-pointer items-start gap-3">
        <input type="checkbox" name="understand" required className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--clay-deep)]" data-testid="peek-understand" />
        <span>{t("peekCheckbox")}</span>
      </label>
      {state.status === "needsConfirm" && (
        <p className="text-sm font-medium text-danger" role="alert" key={state.at}>
          {t("peekNeedsConfirm")}
        </p>
      )}
      <button type="submit" className="btn btn-secondary" disabled={pending} data-testid="peek-submit">
        {t("peekSubmit")}
      </button>
    </form>
  );
}

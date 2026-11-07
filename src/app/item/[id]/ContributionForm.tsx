"use client";

import { useActionState, useId, useState } from "react";
import { useTranslations } from "next-intl";
import { CONTRIBUTION_PRESETS, MIN_CONTRIBUTION } from "@/lib/claims";
import { formatSEK } from "@/lib/format";
import { contribute, type ContributionFormState } from "./actions";

export function ContributionForm({ itemId }: { itemId: number }) {
  const t = useTranslations("contribute");
  const tc = useTranslations("claim");
  const [state, action, pending] = useActionState<ContributionFormState, FormData>(contribute, {});
  const id = useId();
  const v = state.values ?? {};
  const err = state.errors ?? {};
  const [amount, setAmount] = useState(v.amount ?? "300");
  const min = formatSEK(MIN_CONTRIBUTION);

  return (
    <form action={action} className="space-y-4" noValidate data-testid="contribution-form">
      <input type="hidden" name="itemId" value={itemId} />
      {err.form && (
        <p role="alert" className="rounded-[var(--radius)] border border-danger/30 bg-clay-soft p-3 text-sm text-danger">
          {err.form === "unavailable" ? t("errors.unavailable") : err.form === "noSwish" ? t("noSwish") : tc(`errors.${err.form as "generic"}`)}
        </p>
      )}
      <fieldset>
        <legend className="label">{t("amount")}</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="group">
          {CONTRIBUTION_PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              className="chip justify-center font-semibold"
              aria-pressed={amount === String(p)}
              aria-current={amount === String(p) ? "true" : undefined}
              onClick={() => setAmount(String(p))}
              data-testid={`preset-${p}`}
            >
              {formatSEK(p)}
            </button>
          ))}
        </div>
        <label htmlFor={`${id}-amount`} className="label mt-3">
          {t("otherAmount")}
        </label>
        <input
          id={`${id}-amount`}
          name="amount"
          inputMode="numeric"
          pattern="\d*"
          autoComplete="off"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, "").slice(0, 6))}
          aria-invalid={err.amount ? true : undefined}
          aria-describedby={`${id}-amount-help`}
          className="field max-w-40"
          data-testid="contribution-amount"
        />
        <p id={`${id}-amount-help`} className={err.amount ? "mt-1 text-sm text-danger" : "help"}>
          {err.amount ? t("errors.amount", { min }) : t("amountHelp", { min })}
        </p>
      </fieldset>
      <div>
        <label htmlFor={`${id}-name`} className="label">
          {tc("name")}
        </label>
        <input
          id={`${id}-name`}
          name="name"
          required
          autoComplete="name"
          maxLength={80}
          defaultValue={v.name}
          aria-invalid={err.name ? true : undefined}
          className="field"
        />
        {err.name && <p className="mt-1 text-sm text-danger">{tc("errors.name")}</p>}
      </div>
      <div>
        <label htmlFor={`${id}-email`} className="label">
          {tc("email")}
        </label>
        <input
          id={`${id}-email`}
          name="email"
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          maxLength={200}
          defaultValue={v.email}
          aria-invalid={err.email ? true : undefined}
          aria-describedby={`${id}-email-help`}
          className="field"
        />
        <p id={`${id}-email-help`} className="help">
          {tc("emailHelp")}
        </p>
        {err.email && <p className="mt-1 text-sm text-danger">{tc("errors.email")}</p>}
      </div>
      <div>
        <label htmlFor={`${id}-message`} className="label">
          {tc("message")}
        </label>
        <textarea id={`${id}-message`} name="message" maxLength={1000} defaultValue={v.message} className="field" rows={3} />
      </div>
      <label className="flex cursor-pointer items-start gap-3 rounded-[var(--radius)] border border-line bg-linen p-3">
        <input type="checkbox" name="showName" defaultChecked={v.showName === "on"} className="mt-1 h-5 w-5 shrink-0 accent-[var(--eucalyptus-deep)]" />
        <span>
          <span className="font-medium">{t("showName")}</span>
          <span className="help block">{t("showNameHelp")}</span>
        </span>
      </label>
      <button type="submit" className="btn btn-primary w-full" disabled={pending} data-testid="contribution-submit">
        {pending ? tc("submitting") : t("submit")}
      </button>
    </form>
  );
}

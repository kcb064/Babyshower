"use client";

import { useActionState, useId } from "react";
import { useTranslations } from "next-intl";
import { claimItem, type ClaimFormState } from "./actions";

export function ClaimForm({ itemId, remaining }: { itemId: number; remaining: number }) {
  const t = useTranslations("claim");
  const [state, action, pending] = useActionState<ClaimFormState, FormData>(claimItem, {});
  const id = useId();
  const v = state.values ?? {};
  const max = state.max ?? remaining;
  const err = state.errors ?? {};

  return (
    <form action={action} className="space-y-4" noValidate data-testid="claim-form">
      <input type="hidden" name="itemId" value={itemId} />
      {err.form && (
        <p role="alert" className="rounded-[var(--radius)] border border-danger/30 bg-clay-soft p-3 text-sm text-danger">
          {t(`errors.${err.form as "generic"}`)}
        </p>
      )}
      <div>
        <label htmlFor={`${id}-name`} className="label">
          {t("name")}
        </label>
        <input
          id={`${id}-name`}
          name="name"
          required
          autoComplete="name"
          maxLength={80}
          defaultValue={v.name}
          aria-invalid={err.name ? true : undefined}
          aria-describedby={err.name ? `${id}-name-err` : undefined}
          className="field"
        />
        {err.name && (
          <p id={`${id}-name-err`} className="mt-1 text-sm text-danger">
            {t("errors.name")}
          </p>
        )}
      </div>
      <div>
        <label htmlFor={`${id}-email`} className="label">
          {t("email")}
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
          aria-describedby={`${id}-email-help${err.email ? ` ${id}-email-err` : ""}`}
          className="field"
        />
        <p id={`${id}-email-help`} className="help">
          {t("emailHelp")}
        </p>
        {err.email && (
          <p id={`${id}-email-err`} className="mt-1 text-sm text-danger">
            {t("errors.email")}
          </p>
        )}
      </div>
      {remaining > 1 && (
        <div>
          <label htmlFor={`${id}-qty`} className="label">
            {t("qty")}
          </label>
          <select id={`${id}-qty`} name="qty" defaultValue={v.qty ?? "1"} className="field max-w-32">
            {Array.from({ length: remaining }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          {err.qty && <p className="mt-1 text-sm text-danger">{t("errors.qty", { max })}</p>}
        </div>
      )}
      {remaining <= 1 && <input type="hidden" name="qty" value="1" />}
      <div>
        <label htmlFor={`${id}-message`} className="label">
          {t("message")}
        </label>
        <textarea id={`${id}-message`} name="message" maxLength={1000} defaultValue={v.message} className="field" rows={3} />
      </div>
      <div>
        <label htmlFor={`${id}-address`} className="label">
          {t("address")}
        </label>
        <textarea
          id={`${id}-address`}
          name="address"
          maxLength={500}
          autoComplete="street-address"
          defaultValue={v.address}
          className="field"
          rows={2}
          aria-describedby={`${id}-address-help`}
        />
        <p id={`${id}-address-help`} className="help">
          {t("addressHelp")}
        </p>
      </div>
      <fieldset className="space-y-3 rounded-[var(--radius)] border border-line bg-linen p-3">
        <label className="flex cursor-pointer items-start gap-3">
          <input type="checkbox" name="showName" defaultChecked={v.showName === "on"} className="mt-1 h-5 w-5 accent-[var(--eucalyptus-deep)]" />
          <span>
            <span className="font-medium">{t("showName")}</span>
            <span className="help block">{t("showNameHelp")}</span>
          </span>
        </label>
        <label className="flex cursor-pointer items-start gap-3">
          <input type="checkbox" name="purchased" defaultChecked={v.purchased === "on"} className="mt-1 h-5 w-5 accent-[var(--eucalyptus-deep)]" />
          <span className="font-medium">{t("bought")}</span>
        </label>
      </fieldset>
      <p className="help">{t("holdInfo")}</p>
      <button type="submit" className="btn btn-primary w-full" disabled={pending} data-testid="claim-submit">
        {pending ? t("submitting") : t("submit")}
      </button>
    </form>
  );
}

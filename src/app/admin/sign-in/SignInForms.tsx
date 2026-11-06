"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { setDisplayName, signIn, type SignInState } from "./actions";

export function PasscodeForm() {
  const t = useTranslations("admin.signIn");
  const [state, action, pending] = useActionState<SignInState, FormData>(signIn, {});
  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="passcode" className="label">
          {t("passcode")}
        </label>
        <input id="passcode" name="passcode" type="password" required autoComplete="current-password" className="field" />
      </div>
      {state.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error === "rateLimited" ? t("rateLimited") : t("wrong")}
        </p>
      )}
      <button type="submit" className="btn btn-primary w-full" disabled={pending}>
        {t("submit")}
      </button>
    </form>
  );
}

export function NameForm() {
  const t = useTranslations("admin.signIn");
  const [state, action, pending] = useActionState<SignInState, FormData>(setDisplayName, {});
  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="display-name" className="label">
          {t("name")}
        </label>
        <input id="display-name" name="name" required maxLength={40} autoComplete="given-name" className="field" />
        <p className="help">{t("nameHelp")}</p>
      </div>
      {state.error === "name" && (
        <p role="alert" className="text-sm text-danger">
          {t("name")}
        </p>
      )}
      <button type="submit" className="btn btn-primary w-full" disabled={pending}>
        {t("nameSubmit")}
      </button>
    </form>
  );
}

"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { backupNowAction, checkLinksAction, type BackupState, type LinkCheckState } from "./actions";

export function LinkCheckButton() {
  const t = useTranslations("admin.tools");
  const [state, action, pending] = useActionState<LinkCheckState>(checkLinksAction, { status: "idle" });
  return (
    <form action={action} className="space-y-2">
      <button type="submit" className="btn btn-secondary w-full sm:w-auto" disabled={pending} data-testid="check-links">
        {pending ? t("checking") : t("checkLinks")}
      </button>
      <p className="help">{t("checkLinksHelp")}</p>
      <p className="text-sm" role="status" data-testid="check-links-result">
        {state.status === "done" && t("checkLinksDone", { checked: state.checked, dead: state.dead, changed: state.changed })}
        {state.status === "rateLimited" && t("checkLinksWait", { minutes: state.minutes })}
      </p>
    </form>
  );
}

export function BackupButton() {
  const t = useTranslations("admin.tools");
  const [state, action, pending] = useActionState<BackupState>(backupNowAction, { status: "idle" });
  return (
    <form action={action} className="space-y-2">
      <button type="submit" className="btn btn-secondary w-full sm:w-auto" disabled={pending} data-testid="backup-now">
        {pending ? t("backingUp") : t("backup")}
      </button>
      <p className="help">{t("backupHelp")}</p>
      <p className="break-all text-sm" role="status" data-testid="backup-result">
        {state.status === "done" && t("backupDone", { name: state.name, count: state.count })}
        {state.status === "failed" && <span className="text-danger">{t("backupFailed")}</span>}
      </p>
    </form>
  );
}

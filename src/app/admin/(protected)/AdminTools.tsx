"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import {
  backupNowAction,
  checkLinksAction,
  sendRemindersAction,
  type BackupState,
  type LinkCheckState,
  type ReminderState,
} from "./actions";

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

export function ReminderButton({ enabled }: { enabled: boolean }) {
  const t = useTranslations("admin.tools");
  const [state, action, pending] = useActionState<ReminderState>(sendRemindersAction, { status: "idle" });
  return (
    <form action={action} className="space-y-2">
      <button type="submit" className="btn btn-secondary w-full sm:w-auto" disabled={pending || !enabled} data-testid="send-reminders">
        {pending ? t("remindersSending") : t("reminders")}
      </button>
      <p className="help">{t("remindersHelp")}</p>
      <p className="text-sm" role="status" data-testid="send-reminders-result">
        {!enabled || state.status === "off" ? (
          t("remindersOff")
        ) : state.status === "done" ? (
          <>
            {t("remindersDone", { sent: state.sent })}
            {state.failed > 0 && <span className="text-danger"> {t("remindersFailed", { failed: state.failed })}</span>}
          </>
        ) : null}
      </p>
    </form>
  );
}

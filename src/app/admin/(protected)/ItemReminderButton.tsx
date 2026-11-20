"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import { remindItemAction, type ItemReminderState } from "./actions";

/** Emails a reminder to whoever holds an unbought reservation on this item. Only counts come back. */
export function ItemReminderButton({ itemId, enabled }: { itemId: number; enabled: boolean }) {
  const t = useTranslations("admin.items");
  const [state, action, pending] = useActionState<ItemReminderState, FormData>(remindItemAction, { status: "idle" });
  const off = !enabled || state.status === "off";
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="id" value={itemId} />
      <ConfirmSubmit
        message={t("remindConfirm")}
        className="btn btn-secondary btn-small"
        disabled={pending || off}
        title={off ? t("remindOff") : undefined}
        data-testid="remind-item"
      >
        {pending ? t("remindSending") : t("remind")}
      </ConfirmSubmit>
      {state.status === "done" && (
        <span className="text-xs" role="status" data-testid="remind-item-result">
          {state.sent > 0 && t("remindDone", { sent: state.sent })}
          {state.failed > 0 && <span className="text-danger"> {t("remindFailed", { failed: state.failed })}</span>}
          {state.sent === 0 && state.failed === 0 && (state.recent > 0 ? t("remindRecent") : t("remindNone"))}
        </span>
      )}
    </form>
  );
}

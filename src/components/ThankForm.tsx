"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { setThankedAction } from "@/app/admin/(protected)/gifts/actions";

/** "Tackat" checkbox (saves on change) with an optional short note. */
export function ThankForm({ claimId, thanked, note }: { claimId: number; thanked: boolean; note: string | null }) {
  const t = useTranslations("admin.gifts");
  const formRef = useRef<HTMLFormElement>(null);
  const [checked, setChecked] = useState(thanked);
  return (
    <form ref={formRef} action={setThankedAction} className="flex flex-wrap items-center gap-2 rounded-[var(--radius)] bg-linen p-2">
      <input type="hidden" name="claimId" value={claimId} />
      <input type="hidden" name="thanked" value={checked ? "1" : "0"} />
      <label className="flex min-h-11 cursor-pointer items-center gap-2 pr-2 font-medium">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => {
            setChecked(e.target.checked);
            // Let React flush the hidden field, then save.
            requestAnimationFrame(() => formRef.current?.requestSubmit());
          }}
          className="h-5 w-5 accent-[var(--eucalyptus-deep)]"
          data-testid="thank-checkbox"
        />
        {t("thanked")}
      </label>
      {checked && (
        <div className="flex w-full min-w-0 gap-2 sm:w-auto sm:flex-1">
          <input
            name="note"
            defaultValue={note ?? ""}
            maxLength={300}
            placeholder={t("notePlaceholder")}
            aria-label={t("note")}
            className="field min-w-0 flex-1 py-2 text-sm"
            data-testid="thank-note"
          />
          <button type="submit" className="btn btn-secondary btn-small shrink-0">
            {t("saveNote")}
          </button>
        </div>
      )}
    </form>
  );
}

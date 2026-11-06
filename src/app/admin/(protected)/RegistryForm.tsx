"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import type { Registry } from "@/db/schema";
import { updateRegistry, type FormState } from "./actions";

export function RegistryForm({ registry }: { registry: Registry }) {
  const t = useTranslations("admin");
  const [state, action, pending] = useActionState<FormState, FormData>(updateRegistry, {});
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <div>
        <label className="label" htmlFor="titleSv">
          {t("registry.title")} – {t("swedish")}
        </label>
        <input id="titleSv" name="titleSv" required defaultValue={registry.title.sv} className="field" />
      </div>
      <div>
        <label className="label" htmlFor="titleEn">
          {t("registry.title")} – {t("english")}
        </label>
        <input id="titleEn" name="titleEn" defaultValue={registry.title.en ?? ""} className="field" />
      </div>
      <div>
        <label className="label" htmlFor="welcomeSv">
          {t("registry.welcome")} – {t("swedish")}
        </label>
        <textarea id="welcomeSv" name="welcomeSv" rows={4} defaultValue={registry.welcome.sv} className="field" />
      </div>
      <div>
        <label className="label" htmlFor="welcomeEn">
          {t("registry.welcome")} – {t("english")}
        </label>
        <textarea id="welcomeEn" name="welcomeEn" rows={4} defaultValue={registry.welcome.en ?? ""} className="field" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="eventDate">
            {t("registry.date")}
          </label>
          <input id="eventDate" name="eventDate" type="date" required defaultValue={registry.eventDate} className="field" />
        </div>
        <div>
          <label className="label" htmlFor="eventTime">
            {t("registry.time")}
          </label>
          <input id="eventTime" name="eventTime" type="time" defaultValue={registry.eventTime ?? ""} className="field" />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="location">
          {t("registry.location")}
        </label>
        <input id="location" name="location" defaultValue={registry.location ?? ""} className="field" />
      </div>
      <div>
        <label className="label" htmlFor="mapUrl">
          {t("registry.mapUrl")}
        </label>
        <input id="mapUrl" name="mapUrl" type="url" inputMode="url" defaultValue={registry.mapUrl ?? ""} className="field" />
      </div>
      <div>
        <label className="label" htmlFor="hostContact">
          {t("registry.hostContact")}
        </label>
        <input id="hostContact" name="hostContact" defaultValue={registry.hostContact ?? ""} className="field" />
      </div>
      <div>
        <label className="label" htmlFor="swishNumber">
          {t("registry.swish")}
        </label>
        <input id="swishNumber" name="swishNumber" inputMode="tel" defaultValue={registry.swishNumber ?? ""} className="field" />
      </div>
      <div className="flex items-center gap-3 sm:col-span-2">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {t("save")}
        </button>
        <span aria-live="polite" className="text-sm">
          {state.ok && <span className="text-eucalyptus-deep">{t("saved")}</span>}
          {state.error && <span className="text-danger">{t("errors.invalid")}</span>}
        </span>
      </div>
    </form>
  );
}

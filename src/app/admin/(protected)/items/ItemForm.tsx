"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import type { Item, ItemType } from "@/db/schema";
import { fetchFromLink, saveItem, type FormState } from "../actions";

interface Props {
  item?: Item;
  categories: { id: number; name: string }[];
}

export function ItemForm({ item, categories }: Props) {
  const t = useTranslations("admin");
  const [state, action, pending] = useActionState<FormState, FormData>(saveItem, {});
  const [nameSv, setNameSv] = useState(item?.name.sv ?? "");
  const [descriptionSv, setDescriptionSv] = useState(item?.description?.sv ?? "");
  const [storeUrl, setStoreUrl] = useState(item?.storeUrl ?? "");
  const [imageUrl, setImageUrl] = useState(item?.imageUrl ?? "");
  const [price, setPrice] = useState(item?.price?.toString() ?? "");
  const [type, setType] = useState<ItemType>(item?.type ?? "physical");
  const [goal, setGoal] = useState(item?.goalAmount?.toString() ?? "");
  const isProduct = type !== "fund";
  const [fetchStatus, setFetchStatus] = useState<"idle" | "ok" | "failed">("idle");
  const [fetching, startFetch] = useTransition();

  function onFetch() {
    startFetch(async () => {
      const res = await fetchFromLink(storeUrl);
      if (!res.ok) {
        setFetchStatus("failed");
        return;
      }
      const p = res.product;
      if (p.title) setNameSv(p.title.slice(0, 200));
      if (p.imageUrl) setImageUrl(p.imageUrl);
      if (p.price !== null) setPrice(String(p.price));
      if (p.description && !descriptionSv) setDescriptionSv(p.description.slice(0, 2000));
      setFetchStatus("ok");
    });
  }

  return (
    <form action={action} className="space-y-6" encType="multipart/form-data" data-testid="item-form">
      {item && <input type="hidden" name="id" value={item.id} />}
      {item && <input type="hidden" name="sortOrder" value={item.sortOrder} />}

      <fieldset className="space-y-2">
        <legend className="label">{t("items.type")}</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {(["physical", "group", "fund"] as const).map((ty) => {
            const key = ty === "physical" ? "Physical" : ty === "group" ? "Group" : "Fund";
            return (
              <label
                key={ty}
                className={`flex cursor-pointer items-start gap-3 rounded-[var(--radius)] border p-3 ${
                  type === ty ? "border-eucalyptus-deep bg-eucalyptus-soft" : "border-line bg-paper"
                }`}
              >
                <input
                  type="radio"
                  name="type"
                  value={ty}
                  checked={type === ty}
                  onChange={() => setType(ty)}
                  className="mt-1 h-5 w-5 shrink-0 accent-[var(--eucalyptus-deep)]"
                  data-testid={`type-${ty}`}
                />
                <span>
                  <span className="block font-semibold">{t(`items.type${key}`)}</span>
                  <span className="help block">{t(`items.type${key}Help`)}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {isProduct && (
        <fieldset className="card space-y-3 p-4">
          <label className="label" htmlFor="storeUrl">
            {t("items.storeUrl")}
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id="storeUrl"
              name="storeUrl"
              type="url"
              inputMode="url"
              placeholder="https://"
              value={storeUrl}
              onChange={(e) => setStoreUrl(e.target.value)}
              className="field flex-1"
            />
            <button type="button" className="btn btn-secondary" onClick={onFetch} disabled={!storeUrl || fetching}>
              {fetching ? t("items.fetching") : t("items.fetch")}
            </button>
          </div>
          <p aria-live="polite" className="text-sm">
            {fetchStatus === "ok" && <span className="text-eucalyptus-deep">{t("items.fetched")}</span>}
            {fetchStatus === "failed" && <span className="text-danger">{t("items.fetchFailed")}</span>}
          </p>
        </fieldset>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="nameSv">
            {t("items.name")} – {t("swedish")}
          </label>
          <input
            id="nameSv"
            name="nameSv"
            required
            maxLength={200}
            value={nameSv}
            onChange={(e) => setNameSv(e.target.value)}
            className="field"
          />
        </div>
        <div>
          <label className="label" htmlFor="nameEn">
            {t("items.name")} – {t("english")}
          </label>
          <input id="nameEn" name="nameEn" maxLength={200} defaultValue={item?.name.en ?? ""} className="field" />
        </div>
        <div>
          <label className="label" htmlFor="descriptionSv">
            {t("items.description")} – {t("swedish")}
          </label>
          <textarea
            id="descriptionSv"
            name="descriptionSv"
            rows={3}
            maxLength={2000}
            value={descriptionSv}
            onChange={(e) => setDescriptionSv(e.target.value)}
            className="field"
          />
        </div>
        <div>
          <label className="label" htmlFor="descriptionEn">
            {t("items.description")} – {t("english")}
          </label>
          <textarea
            id="descriptionEn"
            name="descriptionEn"
            rows={3}
            maxLength={2000}
            defaultValue={item?.description?.en ?? ""}
            className="field"
          />
        </div>
        <div>
          <label className="label" htmlFor="notesSv">
            {t("items.notes")} – {t("swedish")}
          </label>
          <input id="notesSv" name="notesSv" maxLength={1000} defaultValue={item?.notes?.sv ?? ""} className="field" />
        </div>
        <div>
          <label className="label" htmlFor="notesEn">
            {t("items.notes")} – {t("english")}
          </label>
          <input id="notesEn" name="notesEn" maxLength={1000} defaultValue={item?.notes?.en ?? ""} className="field" />
        </div>
      </div>

      {isProduct && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="imageUrl">
              {t("items.imageUrl")}
            </label>
            <input
              id="imageUrl"
              name="imageUrl"
              inputMode="url"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              className="field"
            />
            <label className="label mt-3" htmlFor="imageFile">
              {t("items.upload")}
            </label>
            <input
              id="imageFile"
              name="imageFile"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="block w-full text-sm"
            />
          </div>
          <div className="flex items-start">
            {imageUrl && (
              <img src={imageUrl} alt="" referrerPolicy="no-referrer" className="card max-h-40 w-auto bg-white object-contain" />
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {type !== "physical" && (
          <div>
            <label className="label" htmlFor="goalAmount">
              {t("items.goal")}
            </label>
            <input
              id="goalAmount"
              name="goalAmount"
              inputMode="numeric"
              pattern="\d*"
              value={goal}
              placeholder={type === "group" ? price : ""}
              required={type === "fund"}
              onChange={(e) => setGoal(e.target.value.replace(/[^\d]/g, ""))}
              aria-describedby="goal-help"
              className="field"
            />
            <p id="goal-help" className="help">
              {type === "group" ? t("items.goalHelpGroup") : t("items.goalHelpFund")}
            </p>
          </div>
        )}
        {isProduct && (
          <div>
            <label className="label" htmlFor="price">
              {t("items.price")}
            </label>
            <input
              id="price"
              name="price"
              inputMode="numeric"
              pattern="\d*"
              value={price}
              onChange={(e) => setPrice(e.target.value.replace(/[^\d]/g, ""))}
              className="field"
            />
          </div>
        )}
        {type === "physical" ? (
          <div>
            <label className="label" htmlFor="qtyWanted">
              {t("items.qty")}
            </label>
            <input
              id="qtyWanted"
              name="qtyWanted"
              type="number"
              min={1}
              max={999}
              required
              defaultValue={item?.qtyWanted ?? 1}
              className="field"
            />
          </div>
        ) : (
          <input type="hidden" name="qtyWanted" value="1" />
        )}
        <div>
          <label className="label" htmlFor="priority">
            {t("items.priority")}
          </label>
          <select id="priority" name="priority" defaultValue={item?.priority ?? "nice"} className="field">
            <option value="must">{t("items.must")}</option>
            <option value="nice">{t("items.nice")}</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="categoryId">
            {t("items.category")}
          </label>
          <select id="categoryId" name="categoryId" defaultValue={item?.categoryId?.toString() ?? ""} className="field">
            <option value="">{t("items.noCategory")}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-2">
        {type === "physical" && (
          <label className="flex min-h-11 items-center gap-2">
            <input
              type="checkbox"
              name="usedOk"
              defaultChecked={item?.usedOk ?? false}
              className="h-5 w-5 accent-[var(--eucalyptus-deep)]"
            />
            {t("items.usedOk")}
          </label>
        )}
        <label className="flex min-h-11 items-center gap-2">
          <input
            type="checkbox"
            name="visible"
            defaultChecked={item?.visible ?? true}
            className="h-5 w-5 accent-[var(--eucalyptus-deep)]"
          />
          {t("items.visible")}
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn btn-primary" disabled={pending} data-testid="save-item">
          {t("save")}
        </button>
        <Link href="/admin#items" className="btn btn-ghost">
          {t("cancel")}
        </Link>
        <span aria-live="polite" className="text-sm text-danger">
          {state.error === "invalid" && t("errors.invalid")}
          {state.error === "image" && t("errors.image")}
          {state.error === "goal" && t("errors.goal")}
          {state.error === "typeLocked" && t("errors.typeLocked")}
        </span>
      </div>
    </form>
  );
}

import { getTranslations } from "next-intl/server";
import type { PublicItemStatus } from "@/lib/claims";

/** "1 av 1 kvar", "2 av 4 reserverade", "Reserverad" plus opted-in names. */
export async function ItemStatus({ status }: { status: PublicItemStatus }) {
  const t = await getTranslations("item");
  let text: string;
  if (status.claimed === 0) text = t("remaining", { remaining: status.remaining, total: status.total });
  else if (status.remaining > 0) text = t("reservedCount", { claimed: status.claimed, total: status.total });
  else text = status.total === 1 ? t("reserved") : t("allReserved");
  const done = status.remaining === 0;
  return (
    <div className="text-sm" data-testid="item-status">
      <p className={`flex items-center gap-2 font-medium ${done ? "text-eucalyptus-deep" : "text-ink"}`}>
        <span
          aria-hidden="true"
          className={`inline-block h-2 w-2 rounded-full ${done ? "bg-eucalyptus-deep" : status.claimed > 0 ? "bg-clay" : "bg-eucalyptus"}`}
        />
        <span data-testid="item-status-text">{text}</span>
      </p>
      {status.names.length > 0 && (
        <p className="mt-0.5 text-ink-soft" data-testid="item-status-names">
          {t("reservedBy", { names: status.names.join(", ") })}
        </p>
      )}
    </div>
  );
}

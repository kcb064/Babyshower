import { getTranslations } from "next-intl/server";
import type { FundTotals } from "@/lib/claims";
import { formatSEK } from "@/lib/format";

/** Progress bar for a group gift or cash fund: "3 100 kr av 5 000 kr", percent and count. */
export async function FundProgress({ fund, size = "md" }: { fund: FundTotals; size?: "md" | "lg" }) {
  const t = await getTranslations("item");
  const label = t("progressLabel");
  return (
    <div className="text-sm" data-testid="fund-progress">
      {fund.boughtWhole ? (
        <p className="flex items-center gap-2 font-medium text-eucalyptus-deep" data-testid="fund-bought-whole">
          <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full bg-eucalyptus-deep" />
          {t("boughtWhole")}
        </p>
      ) : (
        <p className={`flex flex-wrap items-baseline justify-between gap-x-3 ${size === "lg" ? "text-base" : ""}`}>
          <span className="font-semibold" data-testid="fund-progress-text">
            {t("fundProgress", { confirmed: formatSEK(fund.confirmed), goal: formatSEK(fund.goal) })}
          </span>
          <span className="text-ink-soft" data-testid="fund-percent">
            {t("fundPercent", { percent: fund.percent })}
          </span>
        </p>
      )}
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={fund.percent}
        className={`mt-1.5 overflow-hidden rounded-full bg-linen-deep ${size === "lg" ? "h-3" : "h-2"}`}
      >
        <div
          className={`h-full rounded-full ${fund.covered ? "bg-eucalyptus-deep" : "bg-clay"}`}
          style={{ width: `${Math.max(fund.percent, fund.confirmed > 0 ? 3 : 0)}%` }}
        />
      </div>
      <p className="mt-1.5 text-ink-soft" data-testid="fund-count">
        {fund.covered && !fund.boughtWhole ? `${t("goalReached")} · ` : ""}
        {t("fundCount", { count: fund.contributors })}
      </p>
      {fund.names.length > 0 && (
        <p className="mt-0.5 text-ink-soft" data-testid="fund-names">
          {t("contributedBy", { names: fund.names.join(", ") })}
        </p>
      )}
    </div>
  );
}

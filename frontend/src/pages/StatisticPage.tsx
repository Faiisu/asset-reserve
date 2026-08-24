import { BarChart3, ChevronLeft, ChevronRight, Table2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, isAbortError } from "../api";
import { useAuth } from "../auth";
import { AssetReservationChart } from "../components/AssetReservationChart";
import {
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  cx,
} from "../components/ui";
import {
  formatPeriodLabel,
  fromInputValue,
  isCurrentPeriod,
  shiftAnchor,
  toInputValue,
  todayAnchor,
} from "../lib/periodAnchor";
import type { ReservationsByAssetResponse, StatisticsPeriod } from "../types";

const PERIODS: Array<{ value: StatisticsPeriod; label: string }> = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
];

/** Native pickers, so each granularity gets the platform's own calendar and
 * nobody is asked to choose a day that the period ignores. */
const INPUT_TYPE: Record<StatisticsPeriod, string> = {
  day: "date",
  week: "date",
  month: "month",
  year: "number",
};

const STEP_LABEL: Record<StatisticsPeriod, string> = {
  day: "day",
  week: "week",
  month: "month",
  year: "year",
};

const CURRENT_NOUN: Record<StatisticsPeriod, string> = {
  day: "today",
  week: "this week",
  month: "this month",
  year: "this year",
};

export function StatisticPage() {
  const { hasPermission } = useAuth();
  const [period, setPeriod] = useState<StatisticsPeriod>("month");
  const [anchor, setAnchor] = useState(() => todayAnchor());
  const [showTable, setShowTable] = useState(false);
  const [result, setResult] = useState<ReservationsByAssetResponse | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const canView = hasPermission("asset:view");
  const atCurrent = isCurrentPeriod(anchor, period);

  const load = useCallback(
    (
      selectedPeriod: StatisticsPeriod,
      selectedAnchor: string,
      signal?: AbortSignal,
    ) => {
      setLoading(true);
      setError(null);
      void api
        .reservationsByAsset(selectedPeriod, selectedAnchor, signal)
        .then((response) => setResult(response))
        .catch((caught) => {
          if (isAbortError(caught)) return;
          setError(caught);
        })
        .finally(() => {
          if (!signal?.aborted) setLoading(false);
        });
    },
    [],
  );

  useEffect(() => {
    if (!canView) return;
    const controller = new AbortController();
    load(period, anchor, controller.signal);
    return () => controller.abort();
  }, [period, anchor, load, canView]);

  const summary = useMemo(() => {
    if (!result) return null;
    const approvedTotal = result.data.reduce(
      (sum, a) => sum + a.approvedCount,
      0,
    );
    const rejectedTotal = result.data.reduce(
      (sum, a) => sum + a.rejectedCount,
      0,
    );
    const decided = approvedTotal + rejectedTotal;
    return {
      approvedTotal,
      rejectedTotal,
      approvalRate:
        decided > 0 ? Math.round((approvedTotal / decided) * 100) : null,
      assets: result.data.length,
    };
  }, [result]);

  // Derived from the resolved window the server echoed back, not from the
  // local anchor, so the heading can never disagree with the numbers under it.
  const windowLabel = result
    ? formatPeriodLabel(result.periodStart, result.period)
    : null;

  if (!canView) {
    return (
      <EmptyState
        title="You cannot view statistics"
        description="This account does not have asset:view access in any management area."
      />
    );
  }

  return (
    <div className="page-stack">
      {/* One filter row above everything it scopes, so the period is never
          hidden behind a loading, empty, or error state. */}
      <section className="stat-toolbar" aria-label="Statistics filters">
        <div
          className="segmented"
          role="tablist"
          aria-label="Statistics period"
        >
          {PERIODS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={period === option.value}
              className={cx(period === option.value && "segmented--active")}
              onClick={() => setPeriod(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="stat-anchor">
          <button
            type="button"
            className="stat-anchor__step"
            aria-label={`Previous ${STEP_LABEL[period]}`}
            onClick={() =>
              setAnchor((current) => shiftAnchor(current, period, -1))
            }
          >
            <ChevronLeft size={15} aria-hidden />
          </button>
          <label className="stat-anchor__field">
            <span>{STEP_LABEL[period]}</span>
            <input
              type={INPUT_TYPE[period]}
              value={toInputValue(anchor, period)}
              min={period === "year" ? 2000 : undefined}
              max={period === "year" ? 2100 : undefined}
              aria-label={`Choose the ${STEP_LABEL[period]} to report on`}
              onChange={(event) => {
                // A native picker emits "" and half-typed values while it is
                // being edited; only a complete value moves the report.
                const next = fromInputValue(event.target.value, period);
                if (next) setAnchor(next);
              }}
            />
          </label>
          <button
            type="button"
            className="stat-anchor__step"
            aria-label={`Next ${STEP_LABEL[period]}`}
            onClick={() =>
              setAnchor((current) => shiftAnchor(current, period, 1))
            }
          >
            <ChevronRight size={15} aria-hidden />
          </button>
        </div>

        {!atCurrent && (
          <Button
            variant="quiet"
            size="sm"
            onClick={() => setAnchor(todayAnchor())}
          >
            Back to {CURRENT_NOUN[period]}
          </Button>
        )}

        <Button
          className="stat-toolbar__view"
          variant="quiet"
          size="sm"
          disabled={!result || result.data.length === 0}
          onClick={() => setShowTable((current) => !current)}
          aria-pressed={showTable}
        >
          {showTable ? <BarChart3 size={14} /> : <Table2 size={14} />}
          {showTable ? "Chart" : "Table"}
        </Button>
      </section>

      {summary && (
        <section
          className={cx("stat-kpis", loading && "is-refetching")}
          aria-label="Summary"
        >
          <article className="stat-kpi stat-kpi--approved">
            <p className="stat-kpi__label">Approved</p>
            <strong className="stat-kpi__value">
              {summary.approvedTotal.toLocaleString()}
            </strong>
            <span className="stat-kpi__hint">{windowLabel}</span>
          </article>
          <article className="stat-kpi stat-kpi--rejected">
            <p className="stat-kpi__label">Rejected</p>
            <strong className="stat-kpi__value">
              {summary.rejectedTotal.toLocaleString()}
            </strong>
            <span className="stat-kpi__hint">{windowLabel}</span>
          </article>
          <article className="stat-kpi">
            <p className="stat-kpi__label">Approval rate</p>
            <strong className="stat-kpi__value">
              {summary.approvalRate === null ? "—" : `${summary.approvalRate}%`}
            </strong>
            <span className="stat-kpi__hint">
              across {summary.assets} assets
            </span>
          </article>
        </section>
      )}

      <section className="detail-card">
        <header>
          <div>
            <p className="eyebrow">Approved vs. rejected, by asset</p>
            <h2>{windowLabel ? `Decided in ${windowLabel}` : "Decided"}</h2>
          </div>
        </header>

        {loading && !result ? (
          <LoadingState label="Loading statistics" />
        ) : error ? (
          <ErrorState error={error} onRetry={() => load(period, anchor)} />
        ) : !result || result.data.length === 0 ? (
          <EmptyState
            title="No assets yet"
            description="No assets are visible to your account, so there is nothing to measure."
          />
        ) : (
          // Hold the previous render at reduced opacity while a new period
          // loads, rather than flashing a skeleton and jumping the layout.
          <div className={cx("stat-chart-body", loading && "is-refetching")}>
            <AssetReservationChart data={result.data} showTable={showTable} />
          </div>
        )}
      </section>
    </div>
  );
}

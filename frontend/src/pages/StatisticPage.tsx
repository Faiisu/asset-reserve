import { BarChart3, CalendarRange, Table2 } from "lucide-react";
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
  formatDate,
} from "../components/ui";
import type { ReservationsByAssetResponse, StatisticsPeriod } from "../types";

const PERIODS: Array<{ value: StatisticsPeriod; label: string }> = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
];

const PERIOD_NOUN: Record<StatisticsPeriod, string> = {
  day: "today",
  week: "this week",
  month: "this month",
  year: "this year",
};

export function StatisticPage() {
  const { hasPermission } = useAuth();
  const [period, setPeriod] = useState<StatisticsPeriod>("month");
  const [showTable, setShowTable] = useState(false);
  const [result, setResult] = useState<ReservationsByAssetResponse | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const canView = hasPermission("asset:view");

  const load = useCallback(
    (selectedPeriod: StatisticsPeriod, signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      void api
        .reservationsByAsset(selectedPeriod, signal)
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
    load(period, controller.signal);
    return () => controller.abort();
  }, [period, load, canView]);

  const summary = useMemo(() => {
    if (!result) return null;
    const total = result.data.reduce((sum, a) => sum + a.reservedCount, 0);
    const reserved = result.data.filter((a) => a.reservedCount > 0);
    // The API already returns the list ranked, so the leader is the head.
    const top = reserved[0] ?? null;
    return {
      total,
      reservedCount: reserved.length,
      assets: result.data.length,
      top,
    };
  }, [result]);

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
        {result && (
          <span className="stat-toolbar__window">
            <CalendarRange size={14} aria-hidden />
            {formatDate(result.periodStart)} – {formatDate(result.periodEnd)}
          </span>
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
          <article className="stat-kpi stat-kpi--lead">
            <p className="stat-kpi__label">
              Reservations {PERIOD_NOUN[period]}
            </p>
            <strong className="stat-kpi__value">
              {summary.total.toLocaleString()}
            </strong>
          </article>
          <article className="stat-kpi">
            <p className="stat-kpi__label">Assets reserved</p>
            <strong className="stat-kpi__value">
              {summary.reservedCount}
              <span className="stat-kpi__of">/ {summary.assets}</span>
            </strong>
          </article>
          <article className="stat-kpi">
            <p className="stat-kpi__label">Most reserved</p>
            {summary.top ? (
              <>
                <strong className="stat-kpi__value stat-kpi__value--text">
                  {summary.top.partNumber || summary.top.name}
                </strong>
                <span className="stat-kpi__hint">
                  {summary.top.reservedCount}{" "}
                  {summary.top.reservedCount === 1
                    ? "reservation"
                    : "reservations"}
                </span>
              </>
            ) : (
              <strong className="stat-kpi__value stat-kpi__value--muted">
                —
              </strong>
            )}
          </article>
        </section>
      )}

      <section className="detail-card">
        <header>
          <div>
            <p className="eyebrow">Ranked by reservations</p>
            <h2>Every asset, booked {PERIOD_NOUN[period]}</h2>
          </div>
        </header>

        {loading && !result ? (
          <LoadingState label="Loading statistics" />
        ) : error ? (
          <ErrorState error={error} onRetry={() => load(period)} />
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

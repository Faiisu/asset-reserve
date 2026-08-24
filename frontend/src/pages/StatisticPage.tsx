import { Table2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
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

  if (!canView) {
    return (
      <EmptyState
        title="You cannot view statistics"
        description="This account does not have asset:view access in any management area."
      />
    );
  }

  const total =
    result?.data.reduce((sum, asset) => sum + asset.reservedCount, 0) ?? 0;

  return (
    <div className="page-stack">
      <section className="detail-card">
        <header>
          <div>
            <p className="eyebrow">Analytics</p>
            <h2>Reservations by asset</h2>
          </div>
        </header>

        {/* The period switch stays mounted across loading, empty, and error
            states -- when it lived inside the chart, an empty period (a
            legitimate result for "day") removed the only control that could
            get the reader back to a period with data. */}
        <div className="activity-chart__toolbar">
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
          {result && result.data.length > 0 && (
            <Button
              variant="quiet"
              size="sm"
              onClick={() => setShowTable((current) => !current)}
              aria-pressed={showTable}
            >
              <Table2 size={14} />
              {showTable ? "Chart view" : "Table view"}
            </Button>
          )}
        </div>

        {result && (
          <p className="statistic-window" aria-live="polite">
            <strong>{total.toLocaleString()}</strong>{" "}
            {total === 1 ? "reservation" : "reservations"} booked between{" "}
            {formatDate(result.periodStart)} and {formatDate(result.periodEnd)}
          </p>
        )}

        {loading && !result ? (
          <LoadingState label="Loading statistics" />
        ) : error ? (
          <ErrorState error={error} onRetry={() => load(period)} />
        ) : !result || result.data.length === 0 ? (
          <EmptyState
            title="No assets to chart"
            description="No assets are visible to your account yet."
          />
        ) : (
          // Hold the previous render at reduced opacity while a new period
          // loads, rather than flashing a skeleton and jumping the layout.
          <div className={cx(loading && "is-refetching")}>
            <AssetReservationChart data={result.data} showTable={showTable} />
          </div>
        )}
      </section>
    </div>
  );
}

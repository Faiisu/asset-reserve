import { BarChart3, Table2 } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api, isAbortError } from "../api";
import { useAuth } from "../auth";
import { AssetReservationChart } from "../components/AssetReservationChart";
import { AssetUtilizationChart } from "../components/AssetUtilizationChart";
import {
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  cx,
} from "../components/ui";
import { formatRangeLabel, subtractDays, todayIsoDate } from "../lib/dateRange";
import type {
  AssetReservationCount,
  ReservationsByAssetResponse,
} from "../types";

type StatType = "decisions" | "utilization";

const STAT_TYPES: Array<{ value: StatType; label: string }> = [
  { value: "decisions", label: "Approved / Rejected" },
  { value: "utilization", label: "Utilization" },
];

export function StatisticPage() {
  const { hasPermission } = useAuth();
  // Defaults to the trailing 30 days -- a plain, immediately-useful window
  // with no "current period" concept to keep in sync now that start/end can
  // be any two dates.
  const [start, setStart] = useState(() => subtractDays(todayIsoDate(), 29));
  const [end, setEnd] = useState(() => todayIsoDate());
  const [statType, setStatType] = useState<StatType>("decisions");
  const [showTable, setShowTable] = useState(false);
  const [result, setResult] = useState<ReservationsByAssetResponse | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const canView = hasPermission("asset:view");

  const load = useCallback(
    (selectedStart: string, selectedEnd: string, signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      void api
        .reservationsByAsset(selectedStart, selectedEnd, signal)
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
    load(start, end, controller.signal);
    return () => controller.abort();
  }, [start, end, load, canView]);

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
    // The API already ranks by approved+rejected desc, so the leader is the
    // head of the list -- but only once it actually has a decision.
    const top = result.data[0];
    const topTotal = top ? top.approvedCount + top.rejectedCount : 0;

    const measured = result.data.filter((a) => a.utilizationPercent !== null);
    const avgUtilization =
      measured.length > 0
        ? Math.round(
            (measured.reduce((sum, a) => sum + a.utilizationPercent!, 0) /
              measured.length) *
              10,
          ) / 10
        : null;
    const byUtilization = [...measured].sort(
      (a, b) => b.utilizationPercent! - a.utilizationPercent!,
    );

    return {
      approvedTotal,
      rejectedTotal,
      mostRequested: topTotal > 0 ? { asset: top!, total: topTotal } : null,
      avgUtilization,
      mostUtilized: byUtilization[0] ?? null,
      leastUtilized: byUtilization[byUtilization.length - 1] ?? null,
    };
  }, [result]);

  // Derived from the resolved window the server echoed back, not from the
  // local start/end state, so the heading can never disagree with the
  // numbers under it.
  const windowLabel = result
    ? formatRangeLabel(result.periodStart, result.periodEnd)
    : null;

  function renderBody(chart: ReactNode) {
    if (loading && !result) return <LoadingState label="Loading statistics" />;
    if (error)
      return <ErrorState error={error} onRetry={() => load(start, end)} />;
    if (!result || result.data.length === 0) {
      return (
        <EmptyState
          title="No assets yet"
          description="No assets are visible to your account, so there is nothing to measure."
        />
      );
    }
    return (
      // Hold the previous render at reduced opacity while a new range
      // loads, rather than flashing a skeleton and jumping the layout.
      <div className={cx("stat-chart-body", loading && "is-refetching")}>
        {chart}
      </div>
    );
  }

  function utilizationBadge(asset: AssetReservationCount) {
    return (
      <span className="stat-kpi__badge">
        <b className="mono">{asset.partNumber || asset.name}</b>
        <span>{asset.utilizationPercent}%</span>
      </span>
    );
  }

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
      {/* One filter row above everything it scopes, so the range is never
          hidden behind a loading, empty, or error state. */}
      <section className="stat-toolbar" aria-label="Statistics filters">
        <div className="stat-anchor">
          <label className="stat-anchor__field">
            <span>Start</span>
            <input
              type="date"
              value={start}
              max={end}
              aria-label="Report start date"
              onChange={(event) => {
                const next = event.target.value;
                if (!next) return;
                setStart(next);
                // Keep the range valid without rejecting the edit outright --
                // a start dragged past the current end pulls the end along.
                if (next > end) setEnd(next);
              }}
            />
          </label>
          <label className="stat-anchor__field">
            <span>End</span>
            <input
              type="date"
              value={end}
              min={start}
              aria-label="Report end date"
              onChange={(event) => {
                const next = event.target.value;
                if (!next) return;
                setEnd(next);
                if (next < start) setStart(next);
              }}
            />
          </label>
        </div>

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

      <div className="segmented" role="tablist" aria-label="Statistic type">
        {STAT_TYPES.map((option) => (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={statType === option.value}
            className={cx(statType === option.value && "segmented--active")}
            onClick={() => setStatType(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {summary && statType === "decisions" && (
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
            <p className="stat-kpi__label">Most requested</p>
            {summary.mostRequested ? (
              <span className="stat-kpi__badge">
                <b className="mono">
                  {summary.mostRequested.asset.partNumber ||
                    summary.mostRequested.asset.name}
                </b>
                <span>{summary.mostRequested.total} requests</span>
              </span>
            ) : (
              <strong className="stat-kpi__value stat-kpi__value--muted">
                —
              </strong>
            )}
          </article>
        </section>
      )}

      {summary && statType === "utilization" && (
        <section
          className={cx("stat-kpis", loading && "is-refetching")}
          aria-label="Summary"
        >
          <article className="stat-kpi stat-kpi--utilization">
            <p className="stat-kpi__label">Avg utilization</p>
            <strong className="stat-kpi__value">
              {summary.avgUtilization === null
                ? "—"
                : `${summary.avgUtilization}%`}
            </strong>
            <span className="stat-kpi__hint">{windowLabel}</span>
          </article>
          <article className="stat-kpi">
            <p className="stat-kpi__label">Most utilized</p>
            {summary.mostUtilized ? (
              utilizationBadge(summary.mostUtilized)
            ) : (
              <strong className="stat-kpi__value stat-kpi__value--muted">
                —
              </strong>
            )}
          </article>
          <article className="stat-kpi">
            <p className="stat-kpi__label">Least utilized</p>
            {summary.leastUtilized ? (
              utilizationBadge(summary.leastUtilized)
            ) : (
              <strong className="stat-kpi__value stat-kpi__value--muted">
                —
              </strong>
            )}
          </article>
        </section>
      )}

      {statType === "decisions" ? (
        <section
          className="detail-card"
          aria-label="Approved and rejected by asset"
        >
          <header>
            <div>
              <p className="eyebrow">Approved vs. rejected, by asset</p>
              <h2>{windowLabel ? `Decided ${windowLabel}` : "Decided"}</h2>
            </div>
          </header>

          {renderBody(
            result && (
              <AssetReservationChart data={result.data} showTable={showTable} />
            ),
          )}
        </section>
      ) : (
        <section className="detail-card" aria-label="Utilization by asset">
          <header>
            <div>
              <p className="eyebrow">Capacity actually used, by asset</p>
              <h2>
                {windowLabel ? `Utilization ${windowLabel}` : "Utilization"}
              </h2>
            </div>
          </header>

          {renderBody(
            result && (
              <AssetUtilizationChart data={result.data} showTable={showTable} />
            ),
          )}
        </section>
      )}
    </div>
  );
}

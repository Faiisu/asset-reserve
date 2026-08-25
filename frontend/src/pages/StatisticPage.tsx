import {
  BarChart3,
  ChevronDown,
  FileSpreadsheet,
  Filter,
  Search,
  Table2,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api, isAbortError } from "../api";
import { useAuth } from "../auth";
import { AssetDamageChart } from "../components/AssetDamageChart";
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
import { exportStatisticsWorkbook } from "../lib/statisticsExport";
import type {
  AssetReservationCount,
  ReservationsByAssetResponse,
} from "../types";

type StatType = "decisions" | "utilization" | "damage";

const STAT_TYPES: Array<{ value: StatType; label: string }> = [
  { value: "decisions", label: "Approved / Rejected" },
  { value: "utilization", label: "Utilization" },
  { value: "damage", label: "Broken / Lost" },
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
  const [search, setSearch] = useState("");
  const [areaIds, setAreaIds] = useState<string[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);
  const [result, setResult] = useState<ReservationsByAssetResponse | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [exporting, setExporting] = useState(false);
  // Kept separate from `error`: a failed export must not replace the charts
  // with a full-panel error state, since the data on screen is still good.
  const [exportError, setExportError] = useState<string | null>(null);

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

  // Same dismissal contract the assets filter popover uses -- click outside
  // or Escape closes it.
  useEffect(() => {
    if (!filterOpen) return;
    const onPointerDown = (event: globalThis.PointerEvent) => {
      if (!filterRef.current?.contains(event.target as Node)) {
        setFilterOpen(false);
      }
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setFilterOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [filterOpen]);

  // Derived from the response rather than fetched: it costs no request, and
  // it can only ever offer areas that actually have an asset in this window,
  // so no choice in the list can come back empty.
  const areas = useMemo(() => {
    if (!result) return [];
    const byId = new Map<string, string>();
    for (const asset of result.data) {
      byId.set(asset.managementArea.id, asset.managementArea.name);
    }
    return [...byId]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [result]);

  // An area that vanishes when the date range changes must not stay silently
  // selected -- the filter would then exclude everything with no visible
  // cause. Reconciled during render rather than in an effect on `areas`:
  // an effect only corrects the state *after* a render has already happened
  // with the dead id still applied, which flashes the "no asset in the
  // selected areas" empty state for a frame on every range change.
  const liveAreaIds = useMemo(
    () => areaIds.filter((id) => areas.some((area) => area.id === id)),
    [areaIds, areas],
  );

  // Filtered here rather than server-side: the response is already capped at
  // 200 assets and sitting in memory, so matching locally is instant and
  // costs no extra request. The trade-off to know about is that search can
  // only reach what that cap returned -- an asset ranked below it is not in
  // `result.data` to be found. Matched against P/N and area as well as name
  // because the ranked rows label themselves with all three, so anything a
  // reader can see is something they can type.
  const visible = useMemo(() => {
    if (!result) return [];
    const needle = search.trim().toLowerCase();
    // An empty selection means "every area", not "no areas" -- the filter
    // starts unset, and unset must not blank the page.
    const areaFilter = liveAreaIds.length > 0 ? new Set(liveAreaIds) : null;
    if (!needle && !areaFilter) return result.data;
    return result.data.filter((asset) => {
      if (areaFilter && !areaFilter.has(asset.managementArea.id)) return false;
      if (!needle) return true;
      return [
        asset.name,
        asset.partNumber ?? "",
        asset.managementArea.name,
      ].some((field) => field.toLowerCase().includes(needle));
    });
  }, [result, search, liveAreaIds]);

  // Every summary number is derived from `visible`, not the full response:
  // with a filter active the KPI tiles must describe the same assets the
  // chart under them is drawing, or the headline totals quietly contradict
  // the bars.
  const summary = useMemo(() => {
    if (!result) return null;
    const approvedTotal = visible.reduce((sum, a) => sum + a.approvedCount, 0);
    const rejectedTotal = visible.reduce((sum, a) => sum + a.rejectedCount, 0);
    // `visible` preserves the API's approved+rejected desc order, so the
    // leader is still the head of the list -- but only once it actually has
    // a decision.
    const top = visible[0];
    const topTotal = top ? top.approvedCount + top.rejectedCount : 0;

    const measured = visible.filter((a) => a.utilizationPercent !== null);
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

    const brokenTotal = visible.reduce((sum, a) => sum + a.brokenCount, 0);
    const lostTotal = visible.reduce((sum, a) => sum + a.lostCount, 0);
    // The asset that lost the most units, broken and lost together -- the
    // one whose part number a manager would chase first. Ranked here rather
    // than reusing `data`'s approved+rejected order, which says nothing
    // about damage.
    const worstDamaged = visible
      .filter((a) => a.brokenCount + a.lostCount > 0)
      .sort(
        (a, b) =>
          b.brokenCount + b.lostCount - (a.brokenCount + a.lostCount) ||
          b.lostCount - a.lostCount,
      )[0];

    return {
      approvedTotal,
      rejectedTotal,
      mostRequested: topTotal > 0 ? { asset: top!, total: topTotal } : null,
      avgUtilization,
      mostUtilized: byUtilization[0] ?? null,
      leastUtilized: byUtilization[byUtilization.length - 1] ?? null,
      brokenTotal,
      lostTotal,
      worstDamaged: worstDamaged
        ? {
            asset: worstDamaged,
            total: worstDamaged.brokenCount + worstDamaged.lostCount,
          }
        : null,
    };
  }, [result, visible]);

  // Derived from the resolved window the server echoed back, not from the
  // local start/end state, so the heading can never disagree with the
  // numbers under it.
  const windowLabel = result
    ? formatRangeLabel(result.periodStart, result.periodEnd)
    : null;

  const hasFilters = search.trim().length > 0 || liveAreaIds.length > 0;

  /** Exports every statistic topic at once -- the workbook's three sheets
   * are the three segmented-control tabs, so the reader gets what the whole
   * page measures rather than only the tab they happen to be looking at.
   * Scoped to `visible`, so the file matches the filters on screen. */
  async function handleExport() {
    if (!result || visible.length === 0 || exporting) return;
    setExporting(true);
    setExportError(null);
    try {
      await exportStatisticsWorkbook(
        visible,
        result.periodStart,
        result.periodEnd,
      );
    } catch {
      setExportError("Could not create the Excel file. Please try again.");
    } finally {
      setExporting(false);
    }
  }

  function clearFilters() {
    setSearch("");
    setAreaIds([]);
  }

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
    // Kept distinct from "No assets yet": a filter that matches nothing is a
    // fixable mistake, and telling the reader their account sees no assets
    // would send them to an administrator over a typo. Names whichever
    // filter is actually responsible, so the fix is obvious.
    if (visible.length === 0) {
      return (
        <EmptyState
          title={
            search.trim()
              ? `No asset matches "${search.trim()}"`
              : "No asset in the selected areas"
          }
          description="Filters cover asset name, part number, and management area within the selected dates."
          action={
            <Button variant="quiet" size="sm" onClick={clearFilters}>
              Clear filters
            </Button>
          }
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

  /** Lives in the panel header rather than the filter toolbar: it changes
   * how this one panel draws its data, not which data the page is about.
   * The toolbar above scopes what is measured; this only picks a rendering
   * of it. */
  function viewSwitch() {
    return (
      <div className="detail-card__header-actions">
        <Button
          variant="quiet"
          size="sm"
          disabled={!result || result.data.length === 0}
          onClick={() => setShowTable((current) => !current)}
          aria-pressed={showTable}
        >
          {showTable ? <BarChart3 size={14} /> : <Table2 size={14} />}
          {showTable ? "Chart" : "Table"}
        </Button>
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

        {/* No submit button: every asset being searched is already in
            memory, so matches appear as the reader types. A Search button
            would imply a round trip that never happens. */}
        <div className="search-box stat-toolbar__search">
          <Search size={17} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name, P/N, or area"
            aria-label="Search assets"
          />
          {search && (
            <button
              type="button"
              className="stat-toolbar__search-clear"
              onClick={() => setSearch("")}
              aria-label="Clear search"
            >
              <X size={15} />
            </button>
          )}
        </div>

        {/* Management area, the one dimension free-text search handles
            badly: you can type one area's name, but not combine two, and
            not see which areas exist before typing. */}
        <div
          className="calendar-filter-picker stat-toolbar__filter"
          ref={filterRef}
        >
          <button
            type="button"
            className={cx(
              "calendar-filter-btn",
              (liveAreaIds.length > 0 || filterOpen) &&
                "calendar-filter-btn--active",
            )}
            onClick={() => setFilterOpen((prev) => !prev)}
            disabled={areas.length === 0}
            aria-haspopup="dialog"
            aria-expanded={filterOpen}
            aria-label="Filter assets by management area"
          >
            <Filter size={13} />
            <span>Areas</span>
            {liveAreaIds.length > 0 && (
              <span className="calendar-filter-btn__badge">
                {liveAreaIds.length}
              </span>
            )}
            <ChevronDown
              size={14}
              className={cx(
                "calendar-filter-btn__chevron",
                filterOpen && "calendar-filter-btn__chevron--open",
              )}
              aria-hidden
            />
          </button>

          {filterOpen && (
            <div
              className="calendar-filter-popover"
              role="dialog"
              aria-label="Filter by management area"
            >
              <div className="calendar-filter-popover__top">
                <div className="calendar-filter-popover__title">
                  <Filter size={13} />
                  <strong>Management areas</strong>
                </div>
                {liveAreaIds.length > 0 && (
                  <button
                    type="button"
                    className="calendar-filter-popover__reset"
                    onClick={() => setAreaIds([])}
                  >
                    Clear all
                  </button>
                )}
              </div>

              <div className="calendar-filter-popover__list">
                {areas.map((area) => {
                  const checked = liveAreaIds.includes(area.id);
                  return (
                    <label
                      key={area.id}
                      className={cx(
                        "workspace-filter-checkbox-item",
                        checked && "workspace-filter-checkbox-item--checked",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setAreaIds((current) =>
                            current.includes(area.id)
                              ? current.filter((id) => id !== area.id)
                              : [...current, area.id],
                          )
                        }
                        aria-label={area.name}
                      />
                      <span className="workspace-filter-checkbox-item__name">
                        {area.name}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Exports all three topics, not just the visible one, so it belongs
            beside the filters that scope them rather than in any one panel's
            header. */}
        <Button
          variant="secondary"
          size="sm"
          className="stat-toolbar__export"
          onClick={() => void handleExport()}
          loading={exporting}
          disabled={!result || visible.length === 0}
          title="Download one sheet per statistic topic"
        >
          {!exporting && <FileSpreadsheet size={15} />}
          {exporting ? "Preparing…" : "Export Excel"}
        </Button>
      </section>

      {exportError && (
        <p className="stat-toolbar__export-error" role="alert">
          {exportError}
        </p>
      )}

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

      {summary && statType === "damage" && (
        <section
          className={cx("stat-kpis", loading && "is-refetching")}
          aria-label="Summary"
        >
          <article className="stat-kpi stat-kpi--broken">
            <p className="stat-kpi__label">Broken</p>
            <strong className="stat-kpi__value">
              {summary.brokenTotal.toLocaleString()}
            </strong>
            <span className="stat-kpi__hint">{windowLabel}</span>
          </article>
          <article className="stat-kpi stat-kpi--lost">
            <p className="stat-kpi__label">Lost</p>
            <strong className="stat-kpi__value">
              {summary.lostTotal.toLocaleString()}
            </strong>
            <span className="stat-kpi__hint">{windowLabel}</span>
          </article>
          <article className="stat-kpi">
            <p className="stat-kpi__label">Most affected</p>
            {summary.worstDamaged ? (
              <span className="stat-kpi__badge">
                <b className="mono">
                  {summary.worstDamaged.asset.partNumber ||
                    summary.worstDamaged.asset.name}
                </b>
                <span>{summary.worstDamaged.total} units</span>
              </span>
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
            {viewSwitch()}
          </header>

          {renderBody(
            result && (
              <AssetReservationChart data={visible} showTable={showTable} />
            ),
          )}
        </section>
      ) : statType === "utilization" ? (
        <section className="detail-card" aria-label="Utilization by asset">
          <header>
            <div>
              <p className="eyebrow">Capacity actually used, by asset</p>
              <h2>
                {windowLabel ? `Utilization ${windowLabel}` : "Utilization"}
              </h2>
              <p className="detail-card__note">
                % of time each asset&rsquo;s active units were checked out
                during this window.
              </p>
            </div>
            {viewSwitch()}
          </header>

          {renderBody(
            result && (
              <AssetUtilizationChart data={visible} showTable={showTable} />
            ),
          )}
        </section>
      ) : (
        <section className="detail-card" aria-label="Broken and lost by asset">
          <header>
            <div>
              <p className="eyebrow">Units not returned in good condition</p>
              <h2>
                {windowLabel ? `Broken / Lost ${windowLabel}` : "Broken / Lost"}
              </h2>
              <p className="detail-card__note">
                Units a return inspection marked broken or lost in this window,
                counted when the inspection happened.
              </p>
            </div>
            {viewSwitch()}
          </header>

          {renderBody(
            result && <AssetDamageChart data={visible} showTable={showTable} />,
          )}
        </section>
      )}
    </div>
  );
}

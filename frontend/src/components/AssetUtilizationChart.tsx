import { useMemo, useState } from "react";
import { EmptyState } from "./ui";
import type { AssetReservationCount } from "../types";

/** Same ranked-horizontal-bar language as AssetReservationChart, but a
 * single series: utilizationPercent is already a 0-100 fraction of the
 * asset's own capacity, so the bar width is the literal percent rather than
 * scaled to the tallest bar in the list -- a 50%-wide bar means "used half
 * the time," not "used half as much as the busiest asset." One hue (no
 * legend needed for a single series) rather than the approved/rejected
 * green/red: this is a magnitude, not a good/bad outcome.
 *
 * The table view is the same ranked `rows`, the same idle-hiding toggle, and
 * the same empty state as the chart -- it used to be a second, disconnected
 * code path built straight off `data`, so switching Chart -> Table silently
 * un-hid every asset with no active units and re-sorted every row back into
 * approved/rejected order (the order the API happens to return `data` in),
 * which has nothing to do with utilization. */
export function AssetUtilizationChart({
  data,
  showTable,
}: {
  data: AssetReservationCount[];
  showTable: boolean;
}) {
  const [showIdle, setShowIdle] = useState(false);

  const ranked = useMemo(
    () =>
      data
        .filter((asset) => asset.utilizationPercent !== null)
        .sort((a, b) => b.utilizationPercent! - a.utilizationPercent!),
    [data],
  );
  const idle = useMemo(
    () => data.filter((asset) => asset.utilizationPercent === null),
    [data],
  );
  const rows = showIdle ? [...ranked, ...idle] : ranked;

  if (rows.length === 0) {
    return (
      <>
        <EmptyState
          title="No active units to measure"
          description="None of these assets have an active unit registered, so utilization can't be computed."
        />
        {idle.length > 0 && (
          <button
            type="button"
            className="stat-bars__toggle"
            onClick={() => setShowIdle(true)}
          >
            List all {idle.length} assets anyway
          </button>
        )}
      </>
    );
  }

  return (
    <>
      {showTable ? (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Asset</th>
                <th className="stat-table__number">Active units</th>
                <th className="stat-table__number">Utilization</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((asset) => (
                <tr key={asset.assetId}>
                  <td>
                    <strong className="table-primary">{asset.name}</strong>
                    <small className="table-secondary">
                      {asset.partNumber || "No P/N"} ·{" "}
                      {asset.managementArea.name}
                    </small>
                  </td>
                  <td className="mono stat-table__number">
                    {asset.activeUnitCount}
                  </td>
                  <td className="stat-table__number">
                    {asset.utilizationPercent === null ? (
                      "—"
                    ) : (
                      <span className="stat-table__swatch">
                        <i
                          className="stat-bars__fill--utilization"
                          aria-hidden
                        />
                        <b className="mono">{asset.utilizationPercent}%</b>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <ol className="stat-bars">
          {rows.map((asset) => {
            const percent = asset.utilizationPercent;
            return (
              <li
                key={asset.assetId}
                className="stat-bars__row"
                aria-label={
                  percent === null
                    ? `${asset.name}, no active units`
                    : `${asset.name}, ${percent}% utilized`
                }
              >
                <div className="stat-bars__label">
                  <span className="stat-bars__name">{asset.name}</span>
                  <span className="stat-bars__meta">
                    <span className="mono">{asset.partNumber || "No P/N"}</span>
                    <i aria-hidden> · </i>
                    {asset.managementArea.name}
                  </span>
                </div>
                <div className="stat-bars__series">
                  <div className="stat-bars__track">
                    <div
                      className="stat-bars__fill stat-bars__fill--utilization"
                      style={{ width: `${percent ?? 0}%` }}
                    />
                  </div>
                  <b className="stat-bars__value mono">
                    {percent === null ? "—" : `${percent}%`}
                  </b>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {idle.length > 0 && (
        <button
          type="button"
          className="stat-bars__toggle"
          onClick={() => setShowIdle((current) => !current)}
          aria-expanded={showIdle}
        >
          {showIdle
            ? `Hide ${idle.length} assets with no active units`
            : `Show ${idle.length} assets with no active units`}
        </button>
      )}
    </>
  );
}

import { useMemo, useState } from "react";
import { EmptyState } from "./ui";
import type { AssetReservationCount } from "../types";

const SERIES = [
  {
    key: "brokenCount",
    label: "Broken",
    className: "stat-bars__fill--broken",
  },
  {
    key: "lostCount",
    label: "Lost",
    className: "stat-bars__fill--lost",
  },
] as const;

/** Same grouped ranked-bar language as AssetReservationChart -- two counts
 * per asset, drawn side by side and scaled to the single tallest bar so each
 * series can be read across assets and against its sibling at once.
 *
 * Amber for broken, red for lost, matching the AssetUnit status colors in
 * software_spec §7: broken is recoverable (it waits for repair), lost is
 * not, and the palette already says so everywhere else in the app.
 *
 * Ranked by broken+lost descending rather than by the API's approved+rejected
 * order, because the question this segment answers is "which part numbers are
 * costing us units" -- the busiest asset is not necessarily the one bleeding.
 * Assets with neither are hidden behind the same toggle the other two charts
 * use, since a catalog is mostly assets that came back fine. */
export function AssetDamageChart({
  data,
  showTable,
}: {
  data: AssetReservationCount[];
  showTable: boolean;
}) {
  const [showClean, setShowClean] = useState(false);

  const damaged = useMemo(
    () =>
      data
        .filter((asset) => asset.brokenCount + asset.lostCount > 0)
        .sort((a, b) => {
          const delta =
            b.brokenCount + b.lostCount - (a.brokenCount + a.lostCount);
          // Ties break on lost first: losing a unit outright is the worse
          // outcome, so between two assets down the same number of units the
          // one that will never get them back ranks higher.
          return (
            delta || b.lostCount - a.lostCount || a.name.localeCompare(b.name)
          );
        }),
    [data],
  );
  const clean = useMemo(
    () => data.filter((asset) => asset.brokenCount + asset.lostCount === 0),
    [data],
  );
  const rows = showClean ? [...damaged, ...clean] : damaged;
  const max = Math.max(
    ...data.flatMap((asset) => [asset.brokenCount, asset.lostCount]),
    1,
  );

  if (rows.length === 0) {
    return (
      <>
        <EmptyState
          title="Nothing broken or lost in this range"
          description="Every unit inspected inside the selected dates came back in good condition."
        />
        {clean.length > 0 && (
          <button
            type="button"
            className="stat-bars__toggle"
            onClick={() => setShowClean(true)}
          >
            List all {clean.length} assets anyway
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
                <th className="stat-table__number">Broken</th>
                <th className="stat-table__number">Lost</th>
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
                  {SERIES.map((series) => (
                    <td key={series.key} className="stat-table__number">
                      <span className="stat-table__swatch">
                        <i className={series.className} aria-hidden />
                        <b className="mono">{asset[series.key]}</b>
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <div className="stat-bars__legend">
            {SERIES.map((series) => (
              <span key={series.key}>
                <i className={series.className} aria-hidden />
                {series.label}
              </span>
            ))}
          </div>

          <ol className="stat-bars">
            {rows.map((asset) => (
              <li
                key={asset.assetId}
                className="stat-bars__row"
                aria-label={`${asset.name}, ${asset.brokenCount} broken, ${asset.lostCount} lost`}
              >
                <div className="stat-bars__label">
                  <span className="stat-bars__name">{asset.name}</span>
                  <span className="stat-bars__meta">
                    <span className="mono">{asset.partNumber || "No P/N"}</span>
                    <i aria-hidden> · </i>
                    {asset.managementArea.name}
                  </span>
                </div>
                <div className="stat-bars__group">
                  {SERIES.map((series) => {
                    const value = asset[series.key];
                    const percent =
                      value > 0 ? Math.max((value / max) * 100, 2) : 0;
                    return (
                      <div className="stat-bars__series" key={series.key}>
                        <div className="stat-bars__track">
                          <div
                            className={`stat-bars__fill ${series.className}`}
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                        <b className="stat-bars__value mono">{value}</b>
                      </div>
                    );
                  })}
                </div>
              </li>
            ))}
          </ol>
        </>
      )}

      {clean.length > 0 && (
        <button
          type="button"
          className="stat-bars__toggle"
          onClick={() => setShowClean((current) => !current)}
          aria-expanded={showClean}
        >
          {showClean
            ? `Hide ${clean.length} assets with nothing broken or lost`
            : `Show ${clean.length} assets with nothing broken or lost`}
        </button>
      )}
    </>
  );
}

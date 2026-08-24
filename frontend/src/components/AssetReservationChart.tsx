import { useMemo, useState } from "react";
import { EmptyState } from "./ui";
import type { AssetReservationCount } from "../types";

const SERIES = [
  {
    key: "approvedCount",
    label: "Approved",
    className: "stat-bars__fill--approved",
  },
  {
    key: "rejectedCount",
    label: "Rejected",
    className: "stat-bars__fill--rejected",
  },
] as const;

/** Ranked horizontal bars rather than vertical columns: part numbers are long
 * text, and as an x-axis they had to be rotated, truncated, and scrolled
 * sideways. Laid on their side they read straight, wrap to the container, and
 * grow downward -- the direction a list is already expected to grow. Plain
 * HTML/CSS rather than SVG for the same reason: text can ellipsize and reflow
 * on its own instead of being positioned by hand.
 *
 * Approved and rejected are drawn as two grouped (side-by-side, not stacked)
 * tracks per asset so a reader can compare either series across assets and
 * compare the two series against each other within one asset, at the same
 * time. Green/red rather than an arbitrary categorical pair: this genuinely
 * is a good/bad outcome, which is what status color is for. */
export function AssetReservationChart({
  data,
  showTable,
}: {
  data: AssetReservationCount[];
  showTable: boolean;
}) {
  const [showEmpty, setShowEmpty] = useState(false);

  const decided = useMemo(
    () => data.filter((asset) => asset.approvedCount + asset.rejectedCount > 0),
    [data],
  );
  const idleCount = data.length - decided.length;
  const rows = showEmpty ? data : decided;
  // Scaled to the single tallest bar (either series), not their sum -- the
  // two tracks are grouped, not stacked, so each one is read on its own.
  const max = Math.max(
    ...data.flatMap((asset) => [asset.approvedCount, asset.rejectedCount]),
    1,
  );

  if (showTable) {
    return (
      <div className="data-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>P/N</th>
              <th>Asset</th>
              <th>Management area</th>
              <th className="stat-table__number">Approved</th>
              <th className="stat-table__number">Rejected</th>
            </tr>
          </thead>
          <tbody>
            {data.map((asset) => (
              <tr key={asset.assetId}>
                <td className="mono">{asset.partNumber || "—"}</td>
                <td className="table-primary">{asset.name}</td>
                <td className="table-secondary">{asset.managementArea.name}</td>
                <td className="mono stat-table__number">
                  {asset.approvedCount}
                </td>
                <td className="mono stat-table__number">
                  {asset.rejectedCount}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (decided.length === 0 && !showEmpty) {
    return (
      <>
        <EmptyState
          title="No approvals or rejections in this period"
          description="None of these assets had a decision inside the selected window. Try a wider period, such as month or year."
        />
        {idleCount > 0 && (
          <button
            type="button"
            className="stat-bars__toggle"
            onClick={() => setShowEmpty(true)}
          >
            List all {idleCount} assets anyway
          </button>
        )}
      </>
    );
  }

  return (
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
            aria-label={`${asset.name}, ${asset.approvedCount} approved, ${asset.rejectedCount} rejected`}
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

      {idleCount > 0 && (
        <button
          type="button"
          className="stat-bars__toggle"
          onClick={() => setShowEmpty((current) => !current)}
          aria-expanded={showEmpty}
        >
          {showEmpty
            ? `Hide ${idleCount} assets with no decisions`
            : `Show ${idleCount} assets with no decisions`}
        </button>
      )}
    </>
  );
}

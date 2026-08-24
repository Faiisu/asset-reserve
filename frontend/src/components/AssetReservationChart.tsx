import { useMemo, useState } from "react";
import { EmptyState } from "./ui";
import type { AssetReservationCount } from "../types";

/** Ranked horizontal bars rather than vertical columns: part numbers are long
 * text, and as an x-axis they had to be rotated, truncated, and scrolled
 * sideways. Laid on their side they read straight, wrap to the container, and
 * grow downward -- the direction a list is already expected to grow. Plain
 * HTML/CSS rather than SVG for the same reason: text can ellipsize and reflow
 * on its own instead of being positioned by hand. */
export function AssetReservationChart({
  data,
  showTable,
}: {
  data: AssetReservationCount[];
  showTable: boolean;
}) {
  const [showEmpty, setShowEmpty] = useState(false);

  const reserved = useMemo(
    () => data.filter((asset) => asset.reservedCount > 0),
    [data],
  );
  const idleCount = data.length - reserved.length;
  const rows = showEmpty ? data : reserved;
  // Scale to the tallest bar rather than a rounded axis maximum: with direct
  // value labels on every row there is no axis to agree with, and using the
  // full width keeps small differences legible.
  const max = Math.max(...data.map((asset) => asset.reservedCount), 1);

  if (showTable) {
    return (
      <div className="data-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>P/N</th>
              <th>Asset</th>
              <th>Management area</th>
              <th className="stat-table__number">Reservations</th>
            </tr>
          </thead>
          <tbody>
            {data.map((asset) => (
              <tr key={asset.assetId}>
                <td className="mono">{asset.partNumber || "—"}</td>
                <td className="table-primary">{asset.name}</td>
                <td className="table-secondary">{asset.managementArea.name}</td>
                <td className="mono stat-table__number">
                  {asset.reservedCount}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (reserved.length === 0 && !showEmpty) {
    return (
      <>
        <EmptyState
          title="No reservations in this period"
          description="None of these assets are booked inside the selected window. Try a wider period, such as month or year."
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
      <ol className="stat-bars">
        {rows.map((asset) => {
          const percent =
            asset.reservedCount > 0
              ? Math.max((asset.reservedCount / max) * 100, 2)
              : 0;
          return (
            <li
              key={asset.assetId}
              className="stat-bars__row"
              aria-label={`${asset.name}, ${asset.reservedCount} reservations`}
            >
              <div className="stat-bars__label">
                <span className="stat-bars__name">{asset.name}</span>
                <span className="stat-bars__meta">
                  <span className="mono">{asset.partNumber || "No P/N"}</span>
                  <i aria-hidden> · </i>
                  {asset.managementArea.name}
                </span>
              </div>
              <div className="stat-bars__track">
                <div
                  className="stat-bars__fill"
                  style={{ width: `${percent}%` }}
                />
              </div>
              <b className="stat-bars__value mono">{asset.reservedCount}</b>
            </li>
          );
        })}
      </ol>

      {idleCount > 0 && (
        <button
          type="button"
          className="stat-bars__toggle"
          onClick={() => setShowEmpty((current) => !current)}
          aria-expanded={showEmpty}
        >
          {showEmpty
            ? `Hide ${idleCount} assets with no reservations`
            : `Show ${idleCount} assets with no reservations`}
        </button>
      )}
    </>
  );
}

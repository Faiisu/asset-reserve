import { cx } from "./ui";
import type { AssetSummary } from "../types";

/** Canonical AssetUnit.status vocabulary (docs/software_spec/lifecycle-and-state-machines.md §7)
 * paired with the matching AssetSummary.unitCounts key and badge color. */
export const assetUnitStatuses: Array<{
  status: string;
  countKey: keyof AssetSummary["unitCounts"];
  label: string;
  className: string;
}> = [
  { status: "ACTIVE", countKey: "active", label: "Active", className: "status-badge--active" },
  {
    status: "RESERVED",
    countKey: "reserved",
    label: "Reserved",
    className: "status-badge--reserved",
  },
  {
    status: "CHECKED_OUT",
    countKey: "checkedOut",
    label: "Checked out",
    className: "status-badge--checked-out",
  },
  { status: "BROKEN", countKey: "broken", label: "Broken", className: "status-badge--broken" },
  {
    status: "IN_REPAIR",
    countKey: "inRepair",
    label: "In repair",
    className: "status-badge--in-repair",
  },
  { status: "LOST", countKey: "lost", label: "Lost", className: "status-badge--lost" },
  {
    status: "INACTIVE",
    countKey: "inactive",
    label: "Inactive",
    className: "status-badge--inactive",
  },
];

/** Group of count badges (e.g. "3 Active", "1 Broken") for an asset's unitCounts. */
export function AssetUnitStatusBreakdown({
  unitCounts,
}: {
  unitCounts: AssetSummary["unitCounts"];
}) {
  const present = assetUnitStatuses.filter((status) => unitCounts[status.countKey] > 0);

  if (present.length === 0) {
    return (
      <div className="asset-unit-status-group">
        <span className="status-badge status-badge--inactive">
          <span />
          <span className="status-badge__text">No units</span>
        </span>
      </div>
    );
  }

  return (
    <div className="asset-unit-status-group">
      {present.map((status) => (
        <span key={status.countKey} className={cx("status-badge", status.className)}>
          <span />
          <span className="status-badge__text">
            {unitCounts[status.countKey]} {status.label}
          </span>
        </span>
      ))}
    </div>
  );
}

/** Single status pill for one physical AssetUnit's own status. */
export function AssetUnitStatusBadge({ status }: { status: string }) {
  const match = assetUnitStatuses.find((entry) => entry.status === status);
  return (
    <span className={cx("status-badge", match?.className ?? "status-badge--inactive")}>
      <span />
      <span className="status-badge__text">{match?.label ?? status}</span>
    </span>
  );
}

import {
  ArchiveX,
  ArrowDownToLine,
  ArrowLeft,
  CalendarClock,
  CalendarPlus,
  ChevronDown,
  Edit3,
  Filter,
  PackageCheck,
  Power,
  Search,
  UserRound,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { api, ApiClientError } from "../api";
import { useAuth } from "../auth";
import {
  assetUnitStatuses,
  AssetUnitStatusBadge,
} from "../components/AssetUnitStatus";
import {
  AssetPicture,
  Avatar,
  Breadcrumb,
  Button,
  Dialog,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadingState,
  Notice,
  StatusBadge,
  Textarea,
  cx,
  formatDate,
} from "../components/ui";
import type { AssetDetail, AssetUnit } from "../types";

export function AssetDetailPage() {
  const { hasAreaPermission } = useAuth();
  const { assetId = "" } = useParams();
  const location = useLocation();
  const [asset, setAsset] = useState<AssetDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState(
    (location.state as { notice?: string } | null)?.notice ?? "",
  );
  const [adjustOperation, setAdjustOperation] = useState<"ADD" | null>(null);
  const [statusOpen, setStatusOpen] = useState(false);
  const [mutating, setMutating] = useState(false);
  const [selectedUnitIds, setSelectedUnitIds] = useState<string[]>([]);
  const [retireOpen, setRetireOpen] = useState(false);
  const [unitSearch, setUnitSearch] = useState("");
  const [unitStatusFilter, setUnitStatusFilter] = useState<string[]>([]);
  const [unitFilterOpen, setUnitFilterOpen] = useState(false);
  const unitFilterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!unitFilterOpen) return;
    const onPointerDown = (event: globalThis.PointerEvent) => {
      if (!unitFilterRef.current?.contains(event.target as Node)) {
        setUnitFilterOpen(false);
      }
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setUnitFilterOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [unitFilterOpen]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setAsset(await api.asset(assetId));
    } catch (caught) {
      setError(caught);
    } finally {
      setLoading(false);
    }
  }, [assetId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <LoadingState label="Loading asset ledger" />;
  if (error) return <ErrorState error={error} onRetry={() => void load()} />;
  if (!asset)
    return (
      <EmptyState
        title="Asset not found"
        description="This asset may have been moved or may not be in an area you can access."
      />
    );

  const canRequest =
    asset.isActive &&
    hasAreaPermission("reservation:create", asset.managementArea.id);

  const unitRetireBlocked = new Set(["RESERVED", "CHECKED_OUT", "INACTIVE"]);
  const trimmedUnitSearch = unitSearch.trim().toLowerCase();
  const filteredUnits = asset.units.filter((unit) => {
    const matchesSearch =
      !trimmedUnitSearch ||
      unit.serialNumber.toLowerCase().includes(trimmedUnitSearch);
    const matchesStatus =
      unitStatusFilter.length === 0 || unitStatusFilter.includes(unit.status);
    return matchesSearch && matchesStatus;
  });
  const selectableUnits = filteredUnits.filter(
    (unit) => !unitRetireBlocked.has(unit.status),
  );
  const allUnitsSelected =
    selectableUnits.length > 0 &&
    selectableUnits.every((unit) => selectedUnitIds.includes(unit.id));
  const selectedUnits = asset.units.filter((unit) =>
    selectedUnitIds.includes(unit.id),
  );
  const hasActiveUnitFilters = unitStatusFilter.length > 0;

  function toggleUnit(id: string) {
    setSelectedUnitIds((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id],
    );
  }

  function toggleAllUnits() {
    setSelectedUnitIds((current) => {
      if (allUnitsSelected) {
        const selectableIds = new Set(selectableUnits.map((unit) => unit.id));
        return current.filter((id) => !selectableIds.has(id));
      }
      const merged = new Set(current);
      for (const unit of selectableUnits) merged.add(unit.id);
      return [...merged];
    });
  }

  function toggleUnitStatusFilter(status: string) {
    setUnitStatusFilter((current) =>
      current.includes(status)
        ? current.filter((value) => value !== status)
        : [...current, status],
    );
  }

  async function toggleStatus() {
    if (!asset) return;
    setMutating(true);
    try {
      await api.updateAssetStatus(
        asset.id,
        asset.isActive ? "INACTIVE" : "ACTIVE",
        asset.updatedAt,
      );
      setNotice(asset.isActive ? "Asset disabled" : "Asset enabled");
      setStatusOpen(false);
      await load();
    } catch (caught) {
      setError(caught);
    } finally {
      setMutating(false);
    }
  }

  return (
    <div className="page-stack">
      <Breadcrumb
        items={[
          { label: "Asset registry", to: "/assets" },
          { label: asset.name },
        ]}
      />
      {notice && <Notice>{notice}</Notice>}
      <section className="asset-hero">
        <div className="asset-hero__picture">
          <AssetPicture src={asset.pictureUrl} name={asset.name} large />
          <span className="asset-hero__code mono">
            AR-{asset.id.slice(0, 8).toUpperCase()}
          </span>
        </div>
        <div className="asset-hero__main">
          <div className="asset-hero__top">
            <div>
              <p className="eyebrow">
                Asset record / {asset.managementArea.name}
              </p>
              <h1>{asset.name}</h1>
            </div>
            <StatusBadge active={asset.isActive} />
          </div>
          <p className="asset-hero__description">
            {asset.description || "No description for this asset."}
          </p>
          <div className="asset-hero__meta">
            <span className="mono">P/N: {asset.partNumber || "No part number"}</span>
            <span>Updated {formatDate(asset.updatedAt, true)}</span>
          </div>
        </div>
        <div className="asset-hero__actions">
          {canRequest && (
            <Link
              className="button button--primary button--md"
              to={`/reservations/new?assetId=${asset.id}`}
            >
              <CalendarPlus size={16} />
              Request this asset
            </Link>
          )}
          {asset.capabilities.canEdit && (
            <Link
              className="button button--secondary button--md"
              to={`/assets/${asset.id}/edit`}
            >
              <Edit3 size={16} />
              Edit asset
            </Link>
          )}
          {(asset.isActive
            ? asset.capabilities.canDeactivate
            : asset.capabilities.canEdit) && (
            <Button
              variant={asset.isActive ? "danger" : "secondary"}
              onClick={() => setStatusOpen(true)}
            >
              <Power size={16} />
              {asset.isActive ? "Disable" : "Enable"}
            </Button>
          )}
        </div>
      </section>

      <p className="asset-availability-note">
        <CalendarClock size={14} />
        Reservation quantities are schedule-based — choose dates in Calendar
        to see reservable units.
      </p>

      <section className="detail-card">
        <header>
          <div>
            <p className="eyebrow">Physical inventory</p>
            <h2>Serial units</h2>
          </div>
          <div className="detail-card__header-actions">
            <div className="unit-count-stat">
              <strong>{asset.units.length}</strong>
              <span>
                {hasActiveUnitFilters || trimmedUnitSearch
                  ? `unit${asset.units.length === 1 ? "" : "s"} total · showing ${filteredUnits.length}`
                  : `unit${asset.units.length === 1 ? "" : "s"} total`}
              </span>
            </div>
            {asset.capabilities.canManageUnits && (
              <Button size="sm" onClick={() => setAdjustOperation("ADD")}>
                <ArrowDownToLine size={16} />
                Register units
              </Button>
            )}
          </div>
        </header>

        {asset.units.length > 0 && (
          <div className="toolbar toolbar--compact" aria-label="Serial unit filters">
            <div className="search-box">
              <Search size={16} />
              <input
                value={unitSearch}
                onChange={(event) => setUnitSearch(event.target.value)}
                placeholder="Search by serial number"
                aria-label="Search serial units"
              />
            </div>
            <div className="calendar-filter-picker" ref={unitFilterRef}>
              <button
                type="button"
                className={cx(
                  "calendar-filter-btn",
                  (hasActiveUnitFilters || unitFilterOpen) &&
                    "calendar-filter-btn--active",
                )}
                onClick={() => setUnitFilterOpen((prev) => !prev)}
                aria-haspopup="dialog"
                aria-expanded={unitFilterOpen}
                aria-label="Filter serial units by status"
              >
                <Filter size={13} />
                <span>Status</span>
                {hasActiveUnitFilters && (
                  <span className="calendar-filter-btn__badge">
                    {unitStatusFilter.length}
                  </span>
                )}
                <ChevronDown
                  size={14}
                  className={cx(
                    "calendar-filter-btn__chevron",
                    unitFilterOpen && "calendar-filter-btn__chevron--open",
                  )}
                  aria-hidden
                />
              </button>
              {unitFilterOpen && (
                <div
                  className="calendar-filter-popover calendar-filter-popover--single"
                  role="dialog"
                  aria-label="Filter serial units"
                >
                  <div className="calendar-filter-popover__top">
                    <div className="calendar-filter-popover__title">
                      <Filter size={13} />
                      <strong>Status</strong>
                    </div>
                    {hasActiveUnitFilters && (
                      <button
                        type="button"
                        className="calendar-filter-popover__reset"
                        onClick={() => setUnitStatusFilter([])}
                      >
                        Clear all
                      </button>
                    )}
                  </div>
                  <div className="calendar-filter-popover__columns">
                    <section className="calendar-filter-popover__section">
                      <div className="calendar-filter-popover__list">
                        {assetUnitStatuses.map((status) => {
                          const checked = unitStatusFilter.includes(
                            status.status,
                          );
                          return (
                            <label
                              key={status.status}
                              className={cx(
                                "workspace-filter-checkbox-item",
                                checked &&
                                  "workspace-filter-checkbox-item--checked",
                              )}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() =>
                                  toggleUnitStatusFilter(status.status)
                                }
                                aria-label={status.label}
                              />
                              <span className="workspace-filter-checkbox-item__name">
                                {status.label}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </section>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {selectedUnitIds.length > 0 && (
          <div className="selection-bar" aria-live="polite">
            <span>
              <strong>{selectedUnitIds.length}</strong> selected
            </span>
            <div>
              <Button
                variant="danger"
                size="sm"
                onClick={() => setRetireOpen(true)}
              >
                <ArchiveX size={16} />
                Retire
              </Button>
            </div>
          </div>
        )}

        {asset.units.length === 0 ? (
          <EmptyState
            title="No serial units registered"
            description="Register serial numbers above to start tracking physical units for this asset."
          />
        ) : filteredUnits.length === 0 ? (
          <EmptyState
            title="No units match the current filters"
            description="Try a different serial number or clear the status filter."
          />
        ) : (
          <div className="data-table-wrap asset-units-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  {asset.capabilities.canManageUnits && (
                    <th className="cell-check">
                      <input
                        type="checkbox"
                        checked={allUnitsSelected}
                        disabled={selectableUnits.length === 0}
                        onChange={toggleAllUnits}
                        aria-label="Select all"
                      />
                    </th>
                  )}
                  <th>Serial number</th>
                  <th>Status</th>
                  <th>Note</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {filteredUnits.map((unit) => {
                  const isSelectable = !unitRetireBlocked.has(unit.status);
                  const isSelected = selectedUnitIds.includes(unit.id);
                  return (
                    <tr
                      key={unit.id}
                      className={cx(isSelected && "asset-table-row--selected")}
                    >
                      {asset.capabilities.canManageUnits && (
                        <td className="cell-check">
                          <div
                            className={cx(
                              "cell-check__hit",
                              !isSelectable && "cell-check__hit--disabled",
                            )}
                            onClick={() => {
                              if (!isSelectable) return;
                              toggleUnit(unit.id);
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              disabled={!isSelectable}
                              readOnly
                              aria-label={`Select unit ${unit.serialNumber}`}
                            />
                          </div>
                        </td>
                      )}
                      <td className="mono">{unit.serialNumber}</td>
                      <td>
                        <AssetUnitStatusBadge status={unit.status} />
                      </td>
                      <td>
                        <span className="table-secondary">
                          {unit.note || "—"}
                        </span>
                      </td>
                      <td className="mono table-date">
                        {formatDate(unit.updatedAt, true)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="detail-grid">
        <section className="detail-card">
          <header>
            <div>
              <p className="eyebrow">Ownership</p>
              <h2>Owner and edit access</h2>
            </div>
          </header>
          <div className="owner-row">
            <Avatar
              name={asset.owner?.name ?? asset.owner?.email ?? "System"}
              imageUrl={asset.owner?.profilePictureUrl}
            />
            <div>
              <strong>{asset.owner?.name ?? "Unknown creator"}</strong>
              <span>{asset.owner?.email ?? "Legacy asset"}</span>
            </div>
          </div>
          <dl className="detail-list">
            <div>
              <dt>Management area</dt>
              <dd>{asset.managementArea.name}</dd>
            </div>
            <div>
              <dt>Editable by roles</dt>
              <dd>{asset.editPolicy.roles.join(", ") || "No roles"}</dd>
            </div>
            <div>
              <dt>Permission</dt>
              <dd className="mono">{asset.editPolicy.permission}</dd>
            </div>
          </dl>
        </section>

        <section className="detail-card">
          <header>
            <div>
              <p className="eyebrow">Live allocation</p>
              <h2>Current allocations</h2>
            </div>
            <span className="count-badge">
              {asset.activeReservationItems.length}
            </span>
          </header>
          {asset.activeReservationItems.length === 0 ? (
            <div className="inline-empty">
              <PackageCheck size={22} />
              <span>
                <strong>No active allocations</strong>
                No approved reservation allocations are listed.
              </span>
            </div>
          ) : (
            <div className="reservation-list">
              {asset.activeReservationItems.map((item) => (
                <article key={item.id}>
                  <CalendarClock size={18} />
                  <div>
                    <strong>{item.reservation.eventName}</strong>
                    <span>
                      {formatDate(item.reservation.startAt)} –{" "}
                      {formatDate(item.reservation.endAt)}
                    </span>
                  </div>
                  <b>{item.quantity} units</b>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="ledger-card">
        <header>
          <div>
            <p className="eyebrow">Unit event ledger</p>
            <h2>Change history</h2>
          </div>
          <span className="mono">LATEST / {asset.unitEventLedger.length}</span>
        </header>
        {asset.unitEventLedger.length === 0 ? (
          <EmptyState
            title="No ledger entries yet"
            description="Serial unit registrations, status changes, and returns will appear here."
          />
        ) : (
          <div className="data-table-wrap">
            <table className="data-table ledger-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Event</th>
                  <th>Serial</th>
                  <th>Status change</th>
                  <th>Reason</th>
                  <th>Performed by</th>
                </tr>
              </thead>
              <tbody>
                {asset.unitEventLedger.map((item) => (
                  <tr key={item.id}>
                    <td className="mono table-date">
                      {formatDate(item.createdAt, true)}
                    </td>
                    <td>
                      <span className="transaction">{item.eventType}</span>
                    </td>
                    <td className="mono">{item.serialNumber}</td>
                    <td>
                      {item.fromStatus ?? "—"} → {item.toStatus ?? "—"}
                    </td>
                    <td>
                      <strong className="table-primary">
                        {item.reason || "—"}
                      </strong>
                      <small className="table-secondary">
                        {item.batchDescription}
                      </small>
                    </td>
                    <td>
                      <span className="performer">
                        <UserRound size={15} />
                        {item.performedBy.name ?? item.performedBy.email ?? "Unnamed user"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <AdjustOneDialog
        asset={asset}
        operation={adjustOperation}
        onClose={() => setAdjustOperation(null)}
        onDone={async (message) => {
          setAdjustOperation(null);
          setNotice(message);
          await load();
        }}
      />
      <RetireUnitsDialog
        units={selectedUnits}
        open={retireOpen}
        onClose={() => setRetireOpen(false)}
        onDone={async (message) => {
          setRetireOpen(false);
          setSelectedUnitIds([]);
          setNotice(message);
          await load();
        }}
      />
      <Dialog
        open={statusOpen}
        title={asset.isActive ? "Disable asset?" : "Enable asset?"}
        description={
          asset.isActive
            ? "The asset will remain in the ledger but should not be selected for new work."
            : "The asset can be scheduled again according to reservation dates and remaining inventory."
        }
        onClose={() => setStatusOpen(false)}
      >
        <div className="dialog__actions">
          <Button variant="quiet" onClick={() => setStatusOpen(false)}>
            Cancel
          </Button>
          <Button
            variant={asset.isActive ? "danger" : "primary"}
            loading={mutating}
            onClick={() => void toggleStatus()}
          >
            {asset.isActive ? "Confirm disable" : "Confirm enable"}
          </Button>
        </div>
      </Dialog>
      <Link className="floating-back" to="/assets">
        <ArrowLeft size={17} />
        Back to registry
      </Link>
    </div>
  );
}

function AdjustOneDialog({
  asset,
  operation,
  onClose,
  onDone,
}: {
  asset: AssetDetail;
  operation: "ADD" | null;
  onClose: () => void;
  onDone: (message: string) => void | Promise<void>;
}) {
  const [serialNumbers, setSerialNumbers] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const parsedSerials = serialNumbers
    .split(/[\n,]/)
    .map((value) => value.trim())
    .filter(Boolean);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!operation || parsedSerials.length === 0) return;
    setSubmitting(true);
    setError("");
    try {
      await api.registerAssetUnits(asset.id, parsedSerials, reason || undefined);
      await onDone(
        `Registered ${parsedSerials.length} unit${parsedSerials.length === 1 ? "" : "s"}`,
      );
    } catch (caught) {
      setError(
        caught instanceof ApiClientError
          ? caught.message
          : "Unable to register units",
      );
    } finally {
      setSubmitting(false);
    }
  }
  return (
    <Dialog
      open={Boolean(operation)}
      title={`Register units for ${asset.name}`}
      description={`Currently on record: ${asset.unitCounts.total} units`}
      onClose={onClose}
    >
      <form className="form-stack" onSubmit={submit}>
        {error && (
          <div className="form-alert" role="alert">
            {error}
          </div>
        )}
        <Field label="Serial numbers" required>
          <Textarea
            value={serialNumbers}
            onChange={(event) => setSerialNumbers(event.target.value)}
            placeholder={"One serial number per line, e.g.\nSN-001\nSN-002"}
            required
            autoFocus
          />
        </Field>
        <Field label="Reason">
          <Input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Reason for this entry"
          />
        </Field>
        <div className="dialog__actions">
          <Button type="button" variant="quiet" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            loading={submitting}
            disabled={parsedSerials.length === 0}
          >
            Register {parsedSerials.length || ""} unit
            {parsedSerials.length === 1 ? "" : "s"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function RetireUnitsDialog({
  units,
  open,
  onClose,
  onDone,
}: {
  units: AssetUnit[];
  open: boolean;
  onClose: () => void;
  onDone: (message: string) => void | Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (units.length === 0) return;
    setSubmitting(true);
    setError("");
    try {
      await api.retireAssetUnits(
        units.map((unit) => ({
          assetUnitId: unit.id,
          expectedUpdatedAt: unit.updatedAt,
        })),
        reason || undefined,
      );
      await onDone(
        `Retired ${units.length} unit${units.length === 1 ? "" : "s"}`,
      );
      setReason("");
    } catch (caught) {
      setError(
        caught instanceof ApiClientError
          ? caught.message
          : "Unable to retire units",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      title={`Retire ${units.length} unit${units.length === 1 ? "" : "s"}?`}
      description="Retired units move to INACTIVE and are excluded from useable inventory. This cannot be undone from this screen."
      onClose={onClose}
    >
      <form className="form-stack" onSubmit={submit}>
        {error && (
          <div className="form-alert" role="alert">
            {error}
          </div>
        )}
        <div className="confirm-list">
          {units.map((unit) => (
            <span key={unit.id} className="mono">
              {unit.serialNumber}
            </span>
          ))}
        </div>
        <Field label="Reason">
          <Input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Reason for retiring these units"
          />
        </Field>
        <div className="dialog__actions">
          <Button type="button" variant="quiet" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="danger" loading={submitting}>
            Confirm retire
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

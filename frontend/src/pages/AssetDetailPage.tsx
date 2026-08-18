import {
  ArrowDownToLine,
  ArrowLeft,
  CalendarClock,
  Edit3,
  PackageCheck,
  Power,
  UserRound,
} from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { api, ApiClientError } from "../api";
import { useAuth } from "../auth";
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
  formatDate,
} from "../components/ui";
import type { AssetDetail } from "../types";

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
  const [adjustOperation, setAdjustOperation] = useState<
    "ADD" | "REMOVE" | null
  >(null);
  const [statusOpen, setStatusOpen] = useState(false);
  const [mutating, setMutating] = useState(false);

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
            <span>Updated {formatDate(asset.updatedAt, true)}</span>
          </div>
        </div>
        <div className="asset-hero__actions">
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

      <section className="quantity-board">
        <div className="quantity-board__primary">
          <small>Total inventory</small>
          <strong>{asset.totalQuantity}</strong>
          <span>recorded units</span>
        </div>
        <div className="quantity-board__context">
          <CalendarClock size={19} />
          <span>
            <strong>Reservation quantities are schedule-based</strong>
            <small>Choose dates in Calendar to see reservable units.</small>
          </span>
        </div>
        {asset.capabilities.canManageUnits && (
          <div className="quantity-board__actions">
            <Button onClick={() => setAdjustOperation("ADD")}>
              <ArrowDownToLine size={16} />
              Register units
            </Button>
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
  operation: "ADD" | "REMOVE" | null;
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
      description={`Current quantity: ${asset.totalQuantity} units`}
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

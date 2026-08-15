import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowUpFromLine,
  CalendarClock,
  Edit3,
  FilePlus2,
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
  const [templateOpen, setTemplateOpen] = useState(false);
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

  const availablePercent =
    asset.totalQuantity === 0
      ? 0
      : Math.round((asset.availableQuantity / asset.totalQuantity) * 100);

  async function toggleStatus() {
    if (!asset) return;
    setMutating(true);
    try {
      await api.updateAssetStatus(
        asset.id,
        asset.isActive ? "INACTIVE" : "ACTIVE",
        asset.updatedAt,
      );
      setNotice(
        asset.isActive ? "Asset disabled" : "Asset enabled",
      );
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
            <span>{asset.assetTemplate?.name ?? "No template"}</span>
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
          <small>Available</small>
          <strong>{asset.availableQuantity}</strong>
          <span>of {asset.totalQuantity} units</span>
        </div>
        <div className="quantity-board__rail">
          <div>
            <span style={{ width: `${availablePercent}%` }} />
          </div>
          <p>
            <span>{availablePercent}% available</span>
            <span>{asset.allocatedQuantity} allocated</span>
          </p>
        </div>
        {asset.capabilities.canAdjustQuantity && (
          <div className="quantity-board__actions">
            <Button onClick={() => setAdjustOperation("ADD")}>
              <ArrowDownToLine size={16} />
              Add stock
            </Button>
            <Button
              variant="secondary"
              onClick={() => setAdjustOperation("REMOVE")}
              disabled={asset.totalQuantity === 0}
            >
              <ArrowUpFromLine size={16} />
              Remove stock
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
            {hasAreaPermission("asset:create", asset.managementArea.id) && (
              <Button
                variant="quiet"
                size="sm"
                onClick={() => setTemplateOpen(true)}
              >
                <FilePlus2 size={15} />
                Save as template
              </Button>
            )}
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
                All unallocated units are available.
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
            <p className="eyebrow">Inventory ledger</p>
            <h2>Change history</h2>
          </div>
          <span className="mono">LATEST / {asset.inventoryLedger.length}</span>
        </header>
        {asset.inventoryLedger.length === 0 ? (
          <EmptyState
            title="No ledger entries yet"
            description="Stock additions and removals will appear here."
          />
        ) : (
          <div className="data-table-wrap">
            <table className="data-table ledger-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Type</th>
                  <th>Quantity</th>
                  <th>Reason</th>
                  <th>Performed by</th>
                </tr>
              </thead>
              <tbody>
                {asset.inventoryLedger.map((item) => (
                  <tr key={item.id}>
                    <td className="mono table-date">
                      {formatDate(item.createdAt, true)}
                    </td>
                    <td>
                      <span
                        className={`transaction transaction--${item.quantityDelta >= 0 ? "add" : "remove"}`}
                      >
                        {item.transactionType}
                      </span>
                    </td>
                    <td>
                      <strong
                        className={`quantity-delta ${item.quantityDelta >= 0 ? "positive" : "negative"}`}
                      >
                        {item.quantityDelta > 0 ? "+" : ""}
                        {item.quantityDelta}
                      </strong>
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
                        {item.performedBy.name ?? item.performedBy.email}
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
      <SaveTemplateDialog
        asset={asset}
        open={templateOpen}
        onClose={() => setTemplateOpen(false)}
        onDone={(message) => {
          setTemplateOpen(false);
          setNotice(message);
        }}
      />
      <Dialog
        open={statusOpen}
        title={asset.isActive ? "Disable asset?" : "Enable asset?"}
        description={
          asset.isActive
            ? "The asset will remain in the ledger but should not be selected for new work."
            : "The asset will become available again based on its remaining quantity."
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
  const [quantity, setQuantity] = useState("1");
  const [reason, setReason] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!operation) return;
    setSubmitting(true);
    setError("");
    try {
      await api.adjustInventory(
        operation,
        [
          {
            assetId: asset.id,
            quantity: Number(quantity),
            reason: reason || undefined,
          },
        ],
        description || undefined,
      );
      await onDone(
        `${operation === "ADD" ? "Added" : "Removed"} ${quantity} units`,
      );
    } catch (caught) {
      setError(
        caught instanceof ApiClientError
          ? caught.message
          : "Unable to adjust quantity",
      );
    } finally {
      setSubmitting(false);
    }
  }
  return (
    <Dialog
      open={Boolean(operation)}
      title={
        operation === "ADD"
          ? `Add stock for ${asset.name}`
          : `Remove ${asset.name} from stock`
      }
      description={`Current quantity: ${asset.totalQuantity} units`}
      onClose={onClose}
    >
      <form className="form-stack" onSubmit={submit}>
        {error && (
          <div className="form-alert" role="alert">
            {error}
          </div>
        )}
        <Field label="Quantity" required>
          <Input
            type="number"
            min={1}
            max={operation === "REMOVE" ? asset.totalQuantity : undefined}
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
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
        <Field label="Batch description">
          <Textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </Field>
        <div className="dialog__actions">
          <Button type="button" variant="quiet" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting}>
            Save to ledger
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function SaveTemplateDialog({
  asset,
  open,
  onClose,
  onDone,
}: {
  asset: AssetDetail;
  open: boolean;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [name, setName] = useState(asset.name);
  const [description, setDescription] = useState(asset.description ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await api.saveAssetTemplate(asset.id, {
        name,
        description: description || null,
      });
      onDone("Template saved without the image");
    } catch (caught) {
      setError(
        caught instanceof ApiClientError
          ? caught.message
          : "Unable to save template",
      );
    } finally {
      setSubmitting(false);
    }
  }
  return (
    <Dialog
      open={open}
      title="Save as template"
      description="Templates store only the name and description, not the image."
      onClose={onClose}
    >
      <form className="form-stack" onSubmit={submit}>
        {error && (
          <div className="form-alert" role="alert">
            {error}
          </div>
        )}
        <Field label="Template name" required>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
        </Field>
        <Field label="Description">
          <Textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </Field>
        <div className="dialog__actions">
          <Button type="button" variant="quiet" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting}>
            <FilePlus2 size={16} />
            Save template
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

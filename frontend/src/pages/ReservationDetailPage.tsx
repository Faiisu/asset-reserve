import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  Edit3,
  PackageCheck,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  Trash2,
  Users,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
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
  Textarea,
  cx,
  formatDate,
} from "../components/ui";
import {
  rememberReservation,
  reservationDuration,
  reservationStatusLabel,
  toLocalDateTime,
} from "../reservations";
import type {
  AssetSummary,
  ReservationDetail,
  ReservationItemStatus,
  ReservationStatus,
} from "../types";

type DecisionTarget = {
  itemId: string;
  assetName: string;
  decision: "APPROVE" | "REJECT";
} | null;

export function ReservationDetailPage() {
  const { reservationId } = useParams();
  const location = useLocation();
  const { hasAreaPermission } = useAuth();
  const [reservation, setReservation] = useState<ReservationDetail | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [actionError, setActionError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);
  const [decisionTarget, setDecisionTarget] = useState<DecisionTarget>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [reviewingChange, setReviewingChange] = useState<string | null>(null);
  const notice = (location.state as { notice?: string } | null)?.notice;

  const load = useCallback(async () => {
    if (!reservationId) return;
    setError(null);
    try {
      const result = await api.reservation(reservationId);
      setReservation(result);
      rememberReservation(result);
    } catch (caught) {
      setError(caught);
    } finally {
      setLoading(false);
    }
  }, [reservationId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submitDraft() {
    if (!reservation) return;
    setSubmitting(true);
    setActionError(null);
    try {
      const result = await api.submitReservation(
        reservation.id,
        reservation.updatedAt,
      );
      setReservation(result);
      rememberReservation(result);
    } catch (caught) {
      setActionError(caught);
    } finally {
      setSubmitting(false);
    }
  }

  async function decideChange(
    changeRequestId: string,
    decision: "APPROVE" | "REJECT",
  ) {
    if (!reservation) return;
    setReviewingChange(`${changeRequestId}:${decision}`);
    setActionError(null);
    try {
      const result = await api.decideReservationChange(
        reservation.id,
        changeRequestId,
        decision,
      );
      setReservation(result);
      rememberReservation(result);
    } catch (caught) {
      setActionError(caught);
    } finally {
      setReviewingChange(null);
    }
  }

  if (loading) return <LoadingState label="Loading reservation" />;
  if (error || !reservation)
    return <ErrorState error={error} onRetry={() => void load()} />;

  const pendingWarnings = reservation.items.reduce(
    (sum, item) => sum + item.warnings.length,
    0,
  );
  const hasPendingChange = reservation.changeRequests.some(
    (request) => request.status === "PENDING",
  );
  const canApproveChange = reservation.items.every((item) =>
    hasAreaPermission("reservation:approve", item.asset.managementArea.id),
  );
  const canRejectChange = reservation.items.every((item) =>
    hasAreaPermission("reservation:reject", item.asset.managementArea.id),
  );
  const canReviewChanges = canApproveChange || canRejectChange;

  return (
    <div className="page-stack reservation-detail-page">
      <Breadcrumb
        items={[
          { label: "Reservations", to: "/reservations" },
          { label: reservation.eventName },
        ]}
      />
      {notice && <Notice>{notice}</Notice>}
      {Boolean(actionError) && (
        <div className="form-alert" role="alert">
          {actionError instanceof ApiClientError
            ? actionError.message
            : "Unable to complete this reservation action."}
        </div>
      )}

      <section className="reservation-hero">
        <div className="reservation-hero__top">
          <div>
            <p className="eyebrow eyebrow--light">
              Reservation / {reservation.id.slice(0, 8)}
            </p>
            <h1>{reservation.eventName}</h1>
          </div>
          <ReservationStatusBadge status={reservation.status} />
        </div>
        {reservation.description && (
          <p className="reservation-hero__description">
            {reservation.description}
          </p>
        )}
        <div className="reservation-hero__schedule">
          <SchedulePoint
            icon={<CalendarDays size={18} />}
            label="Starts"
            value={formatDate(reservation.startAt, true)}
          />
          <div className="reservation-hero__track">
            <span>
              {reservationDuration(reservation.startAt, reservation.endAt)}
            </span>
          </div>
          <SchedulePoint
            icon={<Clock3 size={18} />}
            label="Ends"
            value={formatDate(reservation.endAt, true)}
          />
        </div>
        <div className="reservation-hero__actions">
          {reservation.capabilities.canRequestChange && (
            <Button
              variant="secondary"
              disabled={hasPendingChange}
              onClick={() => setEditOpen(true)}
            >
              <Edit3 size={17} />
              {hasPendingChange ? "Edit request pending" : "Request changes"}
            </Button>
          )}
          {reservation.capabilities.canSubmit && (
            <Button loading={submitting} onClick={() => void submitDraft()}>
              <Send size={17} />
              Send for approval
            </Button>
          )}
        </div>
      </section>

      {pendingWarnings > 0 && (
        <div className="reservation-overlap-callout" role="status">
          <span>
            <AlertTriangle size={21} />
          </span>
          <div>
            <strong>Unapproved requests overlap this schedule</strong>
            <p>
              {pendingWarnings} asset{" "}
              {pendingWarnings === 1 ? "line has" : "lines have"} other pending
              demand. This is a warning only; approved reservations determine
              final availability.
            </p>
          </div>
        </div>
      )}

      <div className="reservation-detail-grid">
        <main className="reservation-detail-main">
          <section className="reservation-section">
            <header className="reservation-section__header">
              <div>
                <p className="eyebrow">Asset manifest</p>
                <h2>{reservation.items.length} asset types</h2>
              </div>
              <span className="manifest-total">
                {reservation.items.reduce(
                  (sum, item) => sum + item.quantity,
                  0,
                )}{" "}
                units
              </span>
            </header>
            <div className="reservation-item-list">
              {reservation.items.map((item) => (
                <article className="reservation-item-card" key={item.id}>
                  <AssetPicture
                    src={item.asset.pictureUrl}
                    name={item.asset.name}
                  />
                  <div className="reservation-item-card__identity">
                    <Link to={`/assets/${item.asset.id}`}>
                      {item.asset.name}
                    </Link>
                    <span>
                      {item.asset.managementArea.name}
                      {item.asset.template
                        ? ` · ${item.asset.template.name}`
                        : ""}
                    </span>
                  </div>
                  <div className="reservation-item-card__quantity">
                    <small>Requested</small>
                    <strong>{item.quantity}</strong>
                  </div>
                  <div className="reservation-item-card__quantity">
                    <small>Available</small>
                    <strong
                      className={cx(
                        item.quantity > item.availability.availableQuantity &&
                          "is-short",
                      )}
                    >
                      {item.availability.availableQuantity}
                    </strong>
                  </div>
                  <ItemStatusBadge status={item.status} />
                  {item.warnings.map((warning) => (
                    <div className="item-overlap-warning" key={warning.code}>
                      <AlertTriangle size={15} />
                      <span>
                        <strong>{warning.pendingQuantity} units pending</strong>{" "}
                        across {warning.pendingReservationCount} other{" "}
                        {warning.pendingReservationCount === 1
                          ? "request"
                          : "requests"}
                      </span>
                    </div>
                  ))}
                  {item.approval?.comment && (
                    <p className="reservation-item-card__comment">
                      “{item.approval.comment}” —{" "}
                      {item.approval.approver.name ??
                        item.approval.approver.email}
                    </p>
                  )}
                  {(item.capabilities.canApprove ||
                    item.capabilities.canReject) && (
                    <div className="reservation-item-card__actions">
                      {item.capabilities.canReject && (
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() =>
                            setDecisionTarget({
                              itemId: item.id,
                              assetName: item.asset.name,
                              decision: "REJECT",
                            })
                          }
                        >
                          <X size={15} /> Reject
                        </Button>
                      )}
                      {item.capabilities.canApprove && (
                        <Button
                          size="sm"
                          onClick={() =>
                            setDecisionTarget({
                              itemId: item.id,
                              assetName: item.asset.name,
                              decision: "APPROVE",
                            })
                          }
                        >
                          <Check size={15} /> Approve
                        </Button>
                      )}
                    </div>
                  )}
                </article>
              ))}
            </div>
          </section>

          {reservation.changeRequests.length > 0 && (
            <section className="reservation-section">
              <header className="reservation-section__header">
                <div>
                  <p className="eyebrow">Change history</p>
                  <h2>Edit requests</h2>
                </div>
              </header>
              <div className="change-request-list">
                {reservation.changeRequests.map((request) => (
                  <article className="change-request" key={request.id}>
                    <div className="change-request__top">
                      <div>
                        <strong>
                          {request.requestedBy.name ??
                            request.requestedBy.email}
                        </strong>
                        <span>{formatDate(request.createdAt, true)}</span>
                      </div>
                      <span
                        className={cx(
                          "change-status",
                          `change-status--${request.status.toLowerCase()}`,
                        )}
                      >
                        {request.status.toLowerCase()}
                      </span>
                    </div>
                    {request.reason && <p>{request.reason}</p>}
                    <ChangeSummary change={request.changeData} />
                    {request.reviewedBy && (
                      <small className="change-request__reviewer">
                        Reviewed by{" "}
                        {request.reviewedBy.name ?? request.reviewedBy.email}
                      </small>
                    )}
                    {request.status === "PENDING" && canReviewChanges && (
                      <div className="change-request__actions">
                        {canRejectChange && (
                          <Button
                            variant="danger"
                            size="sm"
                            loading={reviewingChange === `${request.id}:REJECT`}
                            onClick={() =>
                              void decideChange(request.id, "REJECT")
                            }
                          >
                            <X size={15} /> Reject edit
                          </Button>
                        )}
                        {canApproveChange && (
                          <Button
                            size="sm"
                            loading={
                              reviewingChange === `${request.id}:APPROVE`
                            }
                            onClick={() =>
                              void decideChange(request.id, "APPROVE")
                            }
                          >
                            <Check size={15} /> Approve edit
                          </Button>
                        )}
                      </div>
                    )}
                  </article>
                ))}
              </div>
            </section>
          )}
        </main>

        <aside className="reservation-detail-aside">
          <section className="reservation-facts">
            <p className="eyebrow">Request owner</p>
            <div className="reservation-person">
              <Avatar
                name={reservation.requester.name ?? reservation.requester.email}
                imageUrl={reservation.requester.profilePictureUrl}
              />
              <span>
                <strong>
                  {reservation.requester.name ?? reservation.requester.email}
                </strong>
                <small>{reservation.requester.email}</small>
              </span>
            </div>
            <dl>
              <div>
                <dt>Created</dt>
                <dd>{formatDate(reservation.createdAt, true)}</dd>
              </div>
              <div>
                <dt>Updated</dt>
                <dd>{formatDate(reservation.updatedAt, true)}</dd>
              </div>
              <div>
                <dt>Reference</dt>
                <dd className="mono">{reservation.id.slice(0, 8)}</dd>
              </div>
            </dl>
          </section>
          <section className="reservation-facts">
            <p className="eyebrow">Participants</p>
            {reservation.participants.length ? (
              reservation.participants.map((person) => (
                <div
                  className="reservation-person reservation-person--small"
                  key={person.id}
                >
                  <Avatar
                    name={person.name ?? person.email}
                    imageUrl={person.profilePictureUrl}
                    size="sm"
                  />
                  <span>
                    <strong>{person.name ?? person.email}</strong>
                    <small>{person.email}</small>
                  </span>
                </div>
              ))
            ) : (
              <div className="reservation-empty-fact">
                <Users size={18} />
                <span>No additional participants</span>
              </div>
            )}
          </section>
          <Link
            className="button button--quiet button--md reservation-back"
            to="/reservations/new"
          >
            <ArrowLeft size={17} /> New reservation
          </Link>
        </aside>
      </div>

      <ItemDecisionDialog
        target={decisionTarget}
        reservationId={reservation.id}
        onClose={() => setDecisionTarget(null)}
        onDecided={(result) => {
          setReservation(result);
          rememberReservation(result);
          setDecisionTarget(null);
        }}
      />
      <ReservationEditDialog
        open={editOpen}
        reservation={reservation}
        onClose={() => setEditOpen(false)}
        onSaved={(result) => {
          setReservation(result);
          rememberReservation(result);
          setEditOpen(false);
        }}
      />
    </div>
  );
}

function SchedulePoint({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="schedule-point">
      <span>{icon}</span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function ReservationStatusBadge({ status }: { status: ReservationStatus }) {
  return (
    <span
      className={cx(
        "reservation-status",
        `reservation-status--${status.toLowerCase()}`,
      )}
    >
      <span />
      {reservationStatusLabel[status]}
    </span>
  );
}

const itemLabels: Record<ReservationItemStatus, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  PREPARED: "Prepared",
  CHECKED_OUT: "Checked out",
  RETURNED: "Returned",
};

function ItemStatusBadge({ status }: { status: ReservationItemStatus }) {
  return (
    <span className={cx("item-status", `item-status--${status.toLowerCase()}`)}>
      {itemLabels[status]}
    </span>
  );
}

function ChangeSummary({
  change,
}: {
  change: ReservationDetail["changeRequests"][number]["changeData"];
}) {
  const entries = [
    change.eventName ? `Event name: ${change.eventName}` : null,
    change.startAt ? `Starts: ${formatDate(change.startAt, true)}` : null,
    change.endAt ? `Ends: ${formatDate(change.endAt, true)}` : null,
    change.items
      ? `${change.items.length} asset types in the revised manifest`
      : null,
  ].filter(Boolean);
  return (
    <ul className="change-summary">
      {entries.map((entry) => (
        <li key={entry}>
          <RefreshCw size={13} />
          {entry}
        </li>
      ))}
    </ul>
  );
}

function ItemDecisionDialog({
  target,
  reservationId,
  onClose,
  onDecided,
}: {
  target: DecisionTarget;
  reservationId: string;
  onClose: () => void;
  onDecided: (detail: ReservationDetail) => void;
}) {
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (target) {
      setComment("");
      setError("");
    }
  }, [target]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!target) return;
    setLoading(true);
    setError("");
    try {
      onDecided(
        await api.decideReservationItem(
          reservationId,
          target.itemId,
          target.decision,
          comment.trim() || undefined,
        ),
      );
    } catch (caught) {
      setError(
        caught instanceof ApiClientError
          ? caught.message
          : "Unable to record this decision.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog
      open={Boolean(target)}
      title={`${target?.decision === "APPROVE" ? "Approve" : "Reject"} ${target?.assetName ?? "asset"}`}
      description={
        target?.decision === "APPROVE"
          ? "Availability will be checked again before approval is recorded."
          : "The requester will see this asset as rejected."
      }
      onClose={onClose}
    >
      <form className="dialog-form" onSubmit={(event) => void submit(event)}>
        {error && (
          <div className="form-alert" role="alert">
            {error}
          </div>
        )}
        <Field
          label="Decision note"
          hint="Optional — add context for the requester"
        >
          <Textarea
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            maxLength={2000}
            rows={4}
          />
        </Field>
        <div className="dialog-actions">
          <Button type="button" variant="quiet" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant={target?.decision === "REJECT" ? "danger" : "primary"}
            loading={loading}
          >
            {target?.decision === "APPROVE" ? (
              <CheckCircle2 size={17} />
            ) : (
              <X size={17} />
            )}
            {target?.decision === "APPROVE" ? "Approve asset" : "Reject asset"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

type EditAsset = {
  assetId: string;
  name: string;
  area: string;
  pictureUrl: string | null;
  totalQuantity: number;
  quantity: number;
};

function ReservationEditDialog({
  open,
  reservation,
  onClose,
  onSaved,
}: {
  open: boolean;
  reservation: ReservationDetail;
  onClose: () => void;
  onSaved: (detail: ReservationDetail) => void;
}) {
  const { hasAreaPermission } = useAuth();
  const initialAssets = useMemo<EditAsset[]>(
    () =>
      reservation.items.map((item) => ({
        assetId: item.asset.id,
        name: item.asset.name,
        area: item.asset.managementArea.name,
        pictureUrl: item.asset.pictureUrl,
        totalQuantity: item.availability.totalQuantity,
        quantity: item.quantity,
      })),
    [reservation],
  );
  const [eventName, setEventName] = useState(reservation.eventName);
  const [description, setDescription] = useState(reservation.description ?? "");
  const [startAt, setStartAt] = useState(toLocalDateTime(reservation.startAt));
  const [endAt, setEndAt] = useState(toLocalDateTime(reservation.endAt));
  const [items, setItems] = useState<EditAsset[]>(initialAssets);
  const [reason, setReason] = useState("");
  const [search, setSearch] = useState("");
  const [assets, setAssets] = useState<AssetSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setEventName(reservation.eventName);
    setDescription(reservation.description ?? "");
    setStartAt(toLocalDateTime(reservation.startAt));
    setEndAt(toLocalDateTime(reservation.endAt));
    setItems(initialAssets);
    setReason("");
    setSearch("");
    setError("");
  }, [open, reservation, initialAssets]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    const timer = window.setTimeout(() => {
      void api
        .assets({ search: search.trim(), isActive: true, limit: 100 })
        .then((response) => active && setAssets(response.data))
        .catch(() => active && setAssets([]));
    }, 180);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [open, search]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!items.length) {
      setError("Keep at least one asset in the reservation.");
      return;
    }
    if (new Date(endAt) <= new Date(startAt)) {
      setError("End time must be later than start time.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const result = await api.requestReservationChange(
        reservation.id,
        {
          eventName: eventName.trim(),
          description: description.trim() || null,
          startAt: new Date(startAt).toISOString(),
          endAt: new Date(endAt).toISOString(),
          items: items.map((item) => ({
            assetId: item.assetId,
            quantity: item.quantity,
          })),
          participantIds: reservation.participants.map((person) => person.id),
        },
        reason.trim() || undefined,
      );
      onSaved(result);
    } catch (caught) {
      setError(
        caught instanceof ApiClientError
          ? caught.message
          : "Unable to send this edit request.",
      );
    } finally {
      setLoading(false);
    }
  }

  const selectedIds = new Set(items.map((item) => item.assetId));
  const editableAssets = assets.filter(
    (asset) =>
      hasAreaPermission("reservation:update", asset.managementArea.id) ||
      hasAreaPermission("reservation:create", asset.managementArea.id),
  );

  return (
    <Dialog
      open={open}
      title="Request reservation changes"
      description="The current approved plan stays in place until an approver accepts this revision."
      onClose={onClose}
      wide
    >
      <form
        className="dialog-form reservation-edit-form"
        onSubmit={(event) => void submit(event)}
      >
        {error && (
          <div className="form-alert" role="alert">
            {error}
          </div>
        )}
        <div className="form-grid form-grid--2">
          <Field label="Event name" required>
            <Input
              value={eventName}
              onChange={(event) => setEventName(event.target.value)}
              required
              maxLength={200}
            />
          </Field>
          <Field label="Reason for changes">
            <Input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="What changed?"
              maxLength={2000}
            />
          </Field>
          <Field label="Starts" required>
            <Input
              type="datetime-local"
              value={startAt}
              onChange={(event) => setStartAt(event.target.value)}
              required
            />
          </Field>
          <Field label="Ends" required>
            <Input
              type="datetime-local"
              value={endAt}
              min={startAt}
              onChange={(event) => setEndAt(event.target.value)}
              required
            />
          </Field>
        </div>
        <Field label="Event notes">
          <Textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
            maxLength={10000}
          />
        </Field>
        <div className="edit-manifest">
          <div className="edit-manifest__heading">
            <strong>Revised asset manifest</strong>
            <span>{items.length} asset types</span>
          </div>
          {items.map((item) => (
            <div className="edit-manifest__row" key={item.assetId}>
              <AssetPicture src={item.pictureUrl} name={item.name} />
              <span>
                <strong>{item.name}</strong>
                <small>{item.area}</small>
              </span>
              <Input
                aria-label={`Quantity for ${item.name}`}
                type="number"
                min={1}
                max={item.totalQuantity}
                value={item.quantity}
                required
                onChange={(event) =>
                  setItems((current) =>
                    current.map((value) =>
                      value.assetId === item.assetId
                        ? { ...value, quantity: Number(event.target.value) }
                        : value,
                    ),
                  )
                }
              />
              <button
                type="button"
                className="icon-button icon-button--danger"
                aria-label={`Remove ${item.name}`}
                onClick={() =>
                  setItems((current) =>
                    current.filter((value) => value.assetId !== item.assetId),
                  )
                }
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          <div className="edit-asset-search">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search to add another asset"
            />
            {search && (
              <div className="edit-asset-search__results">
                {editableAssets
                  .filter((asset) => !selectedIds.has(asset.id))
                  .slice(0, 6)
                  .map((asset) => (
                    <button
                      type="button"
                      key={asset.id}
                      onClick={() => {
                        setItems((current) => [
                          ...current,
                          {
                            assetId: asset.id,
                            name: asset.name,
                            area: asset.managementArea.name,
                            pictureUrl: asset.pictureUrl,
                            totalQuantity: asset.totalQuantity,
                            quantity: 1,
                          },
                        ]);
                        setSearch("");
                      }}
                    >
                      <Plus size={15} />
                      <span>
                        <strong>{asset.name}</strong>
                        <small>{asset.managementArea.name}</small>
                      </span>
                    </button>
                  ))}
              </div>
            )}
          </div>
        </div>
        <div className="edit-request-note">
          <ShieldCheck size={17} />
          <span>
            Approvers will recheck asset availability before applying this
            request.
          </span>
        </div>
        <div className="dialog-actions">
          <Button type="button" variant="quiet" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={loading}>
            <Send size={17} /> Send edit request
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

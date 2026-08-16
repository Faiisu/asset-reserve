import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  Edit3,
  Eye,
  PackageCheck,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  Trash2,
  Truck,
  Users,
  X,
  XCircle,
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
  ReturnDetail,
  ReturnItemDetail,
} from "../types";

type ReservationItem = ReservationDetail["items"][number];

type DecisionTarget = {
  itemIds: string[];
  assetNames: string[];
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
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [editOpen, setEditOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [returnDecisionTarget, setReturnDecisionTarget] = useState<{
    returnId: string;
    decision: "APPROVE" | "REJECT";
    returnRecord: ReturnDetail;
  } | null>(null);
  const [singleDeliveryItemId, setSingleDeliveryItemId] = useState<string | null>(null);
  const [deliveryConfirmOpen, setDeliveryConfirmOpen] = useState(false);
  const [reviewingChange, setReviewingChange] = useState<string | null>(null);
  const [noticeState, setNoticeState] = useState<string>("");
  const notice = (location.state as { notice?: string } | null)?.notice || noticeState;

  async function handleConfirmDelivery(itemIds?: string[]) {
    if (!reservation) return;
    setActionError(null);
    const result = await api.confirmDelivery(reservation.id, itemIds);
    setReservation(result);
    rememberReservation(result);
    setSingleDeliveryItemId(null);
    setNoticeState(
      result.status === "DELIVERY_CONFIRMED"
        ? "All equipment delivery confirmed (Event status: Delivery Confirmed)"
        : "Selected equipment delivery confirmed",
    );
  }

  async function confirmCancel(reason?: string) {
    if (!reservation) return;
    setActionError(null);
    const result = await api.cancelReservation(reservation.id, reason);
    setReservation(result);
    rememberReservation(result);
    setNoticeState("Reservation cancelled");
  }

  const load = useCallback(async () => {
    if (!reservationId) return;
    setError(null);
    try {
      const result = await api.reservation(reservationId);
      setReservation(result);
      setSelectedItemIds([]);
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
  const isReturnPhase = [
    "DELIVERY_CONFIRMED",
    "ACTIVE",
    "RETURN",
    "RETURN_PENDING",
    "RETURN_CONFIRMED",
    "COMPLETED",
  ].includes(reservation.status);
  const returnableItems = reservation.items.filter(
    (item) =>
      item.status !== "REJECTED" &&
      item.status !== "PENDING" &&
      item.status !== "APPROVED" &&
      ((item.returnSummary?.remainingReturnQuantity ?? item.quantity) > 0 ||
        (item.returnSummary?.lostQuantity ?? 0) > 0),
  );
  const canRecordReturn = isReturnPhase && returnableItems.length > 0;
  const decidableItems = reservation.items.filter(
    (item) => item.capabilities.canApprove || item.capabilities.canReject,
  );
  const selectableItems = isReturnPhase ? returnableItems : decidableItems;
  const selectedItems = selectableItems.filter((item) =>
    selectedItemIds.includes(item.id),
  );
  const allSelectableSelected =
    selectableItems.length > 0 &&
    selectedItems.length === selectableItems.length;
  const canApproveSelected =
    !isReturnPhase &&
    selectedItems.length > 0 &&
    selectedItems.every((item) => item.capabilities.canApprove);
  const canRejectSelected =
    !isReturnPhase &&
    selectedItems.length > 0 &&
    selectedItems.every((item) => item.capabilities.canReject);
  const canApproveReturnSelected =
    isReturnPhase &&
    selectedItems.length > 0 &&
    selectedItems.every((item) =>
      hasAreaPermission("return:approve", item.asset.managementArea.id),
    );

  function toggleItemSelection(itemId: string) {
    setSelectedItemIds((current) =>
      current.includes(itemId)
        ? current.filter((id) => id !== itemId)
        : [...current, itemId],
    );
  }

  function openDecision(decision: "APPROVE" | "REJECT") {
    setDecisionTarget({
      itemIds: selectedItems.map((item) => item.id),
      assetNames: selectedItems.map((item) => item.asset.name),
      decision,
    });
  }

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
        <ReservationStepper status={reservation.status} />
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
          {reservation.capabilities.canConfirmDelivery && (
            <Button
              variant="secondary"
              onClick={() => setDeliveryConfirmOpen(true)}
            >
              <Truck size={17} />
              Confirm delivery
            </Button>
          )}
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
          {reservation.capabilities.canCancel && (
            <Button variant="danger" onClick={() => setCancelOpen(true)}>
              <XCircle size={17} />
              Cancel reservation
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
          {!isReturnPhase && (
            <section className="reservation-section">
              <header className="reservation-section__header">
                <div>
                  <p className="eyebrow">Asset manifest</p>
                  <h2>{reservation.items.length} asset types</h2>
                </div>
                <div className="reservation-manifest-tools">
                  {selectableItems.length > 0 && (
                  <label className="approval-select-all">
                    <input
                      type="checkbox"
                      checked={allSelectableSelected}
                      onChange={() =>
                        setSelectedItemIds(
                          allSelectableSelected
                            ? []
                            : selectableItems.map((item) => item.id),
                        )
                      }
                    />
                    {isReturnPhase ? "Select all returnable" : "Select all pending"}
                  </label>
                )}
                <span className="manifest-total">
                  {reservation.items.reduce(
                    (sum, item) => sum + item.quantity,
                    0,
                  )}{" "}
                  units
                </span>
              </div>
            </header>
            {selectedItems.length > 0 && (
              <div
                className={cx(
                  "approval-selection-bar",
                  isReturnPhase && "return-selection-bar",
                )}
                role="region"
                aria-live="polite"
              >
                <div className="approval-selection-bar__count">
                  <span>{selectedItems.length}</span>
                  <div>
                    <strong>
                      {selectedItems.length === 1
                        ? isReturnPhase
                          ? "asset selected for return"
                          : "asset selected"
                        : isReturnPhase
                        ? "assets selected for return"
                        : "assets selected"}
                    </strong>
                    <small>
                      {isReturnPhase
                        ? "Confirm condition (Intact, Broken, Lost) and approve return"
                        : "One decision and note will apply to all"}
                    </small>
                  </div>
                </div>
                <div className="approval-selection-bar__actions">
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={!canRejectSelected}
                    title={
                      canRejectSelected
                        ? undefined
                        : "You do not have reject permission for every selected asset"
                    }
                    onClick={() => openDecision("REJECT")}
                  >
                    <X size={15} /> Reject selected
                  </Button>
                  <Button
                    size="sm"
                    disabled={!canApproveSelected}
                    title={
                      canApproveSelected
                        ? undefined
                        : "You do not have approve permission for every selected asset"
                    }
                    onClick={() => openDecision("APPROVE")}
                  >
                    <Check size={15} /> Approve selected
                  </Button>
                </div>
              </div>
            )}
            <div className="reservation-item-list">
              {reservation.items.map((item) => {
                const selectable = isReturnPhase
                  ? returnableItems.some((ri) => ri.id === item.id)
                  : item.capabilities.canApprove || item.capabilities.canReject;
                const selected = selectedItemIds.includes(item.id);
                return (
                  <article
                    className={cx(
                      "reservation-item-card",
                      selectable && "reservation-item-card--selectable",
                      selected && "reservation-item-card--selected",
                    )}
                    key={item.id}
                    onClick={(event) => {
                      if (
                        !selectable ||
                        (event.target as Element).closest("a, button, input")
                      ) {
                        return;
                      }
                      toggleItemSelection(item.id);
                    }}
                  >
                    {selectable ? (
                      <input
                        className="reservation-item-select"
                        type="checkbox"
                        aria-label={`Select ${item.asset.name}`}
                        checked={selected}
                        onChange={() => toggleItemSelection(item.id)}
                      />
                    ) : (
                      <span
                        className="reservation-item-select-spacer"
                        aria-hidden="true"
                      />
                    )}
                    <AssetPicture
                      src={item.asset.pictureUrl}
                      name={item.asset.name}
                    />
                    <div className="reservation-item-card__identity">
                      <strong>{item.asset.name}</strong>
                      <span>
                        {item.asset.managementArea.name}
                        {item.asset.template
                          ? ` · ${item.asset.template.name}`
                          : ""}
                      </span>
                    </div>
                    <div className="reservation-item-card__quantity reservation-item-card__quantity--requested">
                      <small>Requested</small>
                      <strong>{item.quantity}</strong>
                    </div>
                    <div className="reservation-item-card__quantity reservation-item-card__quantity--available">
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
                    <div className="reservation-item-card__links">
                      <Link
                        className="reservation-item-card__view"
                        to={`/assets/${item.asset.id}`}
                        aria-label={`View ${item.asset.name}`}
                      >
                        <Eye size={14} /> View
                      </Link>
                      {item.capabilities?.canConfirmDelivery && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setSingleDeliveryItemId(item.id);
                            setDeliveryConfirmOpen(true);
                          }}
                        >
                          <Truck size={14} /> Confirm delivery
                        </Button>
                      )}
                    </div>
                    {item.warnings.map((warning) => (
                      <div className="item-overlap-warning" key={warning.code}>
                        <AlertTriangle size={15} />
                        <span>
                          <strong>
                            {warning.pendingQuantity} units pending
                          </strong>{" "}
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
                    {item.returnSummary &&
                      (item.returnSummary.returnedQuantity > 0 ||
                        item.returnSummary.pendingReturnQuantity > 0 ||
                        item.returnSummary.brokenQuantity > 0 ||
                        item.returnSummary.lostQuantity > 0) && (
                        <div className="item-return-summary">
                          <span className="item-return-summary__badge">
                            {item.returnSummary.returnedQuantity}/{item.quantity} returned
                          </span>
                          {item.returnSummary.pendingReturnQuantity > 0 && (
                            <span className="item-return-summary__pending">
                              ({item.returnSummary.pendingReturnQuantity} pending confirmation)
                            </span>
                          )}
                          {item.returnSummary.brokenQuantity > 0 && (
                            <span className="item-return-summary__broken">
                              {item.returnSummary.brokenQuantity} broken
                            </span>
                          )}
                          {item.returnSummary.lostQuantity > 0 && (
                            <span className="item-return-summary__lost">
                              {item.returnSummary.lostQuantity} lost
                            </span>
                          )}
                        </div>
                      )}
                  </article>
                );
              })}
            </div>
          </section>
          )}

          {(isReturnPhase || reservation.returns.length > 0) && (
            <section className="reservation-section">
              {!canRecordReturn && (
                <header className="reservation-section__header">
                  <div>
                    <p className="eyebrow">Asset return confirmation</p>
                    <h2>
                      {reservation.returns.length === 0
                        ? "Waiting for return"
                        : `${reservation.returns.length} ${
                            reservation.returns.length === 1
                              ? "return record"
                              : "return records"
                          }`}
                    </h2>
                  </div>
                </header>
              )}

              {canRecordReturn && (
                <InlineReturnForm
                  reservation={reservation}
                  selectedItemIds={selectedItemIds}
                  onSaved={(result) => {
                    setReservation(result);
                    rememberReservation(result);
                    setSelectedItemIds([]);
                    setNoticeState("Return recorded successfully");
                  }}
                />
              )}

              {reservation.returns.length === 0 && !canRecordReturn && (
                <div className="reservation-empty-returns">
                  <PackageCheck size={22} />
                  <div>
                    <strong>No return records submitted yet</strong>
                    <p>
                      When the event concludes, record returned equipment for
                      management area confirmation.
                    </p>
                  </div>
                </div>
              )}

              {reservation.returns.length > 0 && (
                <>
                  {canRecordReturn && (
                    <h3 className="return-history-heading">
                      Return records ({reservation.returns.length})
                    </h3>
                  )}
                  <div className="return-card-list">
                  {reservation.returns.map((ret) => {
                    const canApproveThis =
                      ret.capabilities?.canApprove ||
                      (ret.status === "PENDING" &&
                        ret.items.every((it) =>
                          hasAreaPermission(
                            "return:approve",
                            it.managementArea.id,
                          ),
                        ));
                    return (
                      <article className="return-card" key={ret.id}>
                        <div className="return-card__top">
                          <div>
                            <div className="return-card__title-row">
                              <strong>Return / {ret.id.slice(0, 8)}</strong>
                              <ReturnStatusBadge status={ret.status} />
                            </div>
                            <span>
                              Submitted by{" "}
                              {ret.returnedBy.name ?? ret.returnedBy.email} ·{" "}
                              {formatDate(ret.returnedAt ?? ret.createdAt, true)}
                            </span>
                          </div>
                        </div>
                        <div className="return-card__items">
                          {ret.items.map((it) => (
                            <div className="return-card__item-row" key={it.id}>
                              <div className="return-card__item-info">
                                <strong>{it.assetName}</strong>
                                <small>{it.managementArea.name}</small>
                                {it.description && (
                                  <p className="return-card__item-note">
                                    "{it.description}"
                                  </p>
                                )}
                              </div>
                              <div className="return-card__item-tags">
                                {it.quantityReturned > 0 && (
                                  <span className="return-tag return-tag--intact">
                                    {it.quantityReturned} intact
                                  </span>
                                )}
                                {it.quantityBroken > 0 && (
                                  <span className="return-tag return-tag--broken">
                                    {it.quantityBroken} broken
                                  </span>
                                )}
                                {it.quantityLost > 0 && (
                                  <span className="return-tag return-tag--lost">
                                    {it.quantityLost} lost
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                        {ret.approval && (
                          <div className="return-card__approval-callout">
                            <small>
                              {ret.approval.status === "APPROVED"
                                ? "Confirmed & approved"
                                : "Rejected"}{" "}
                              by{" "}
                              <strong>
                                {ret.approval.approver.name ??
                                  ret.approval.approver.email}
                              </strong>
                              {ret.approval.decidedAt &&
                                ` · ${formatDate(ret.approval.decidedAt, true)}`}
                            </small>
                            {ret.approval.description && (
                              <p>"{ret.approval.description}"</p>
                            )}
                          </div>
                        )}
                        {ret.status === "PENDING" && canApproveThis && (
                          <div className="return-card__actions">
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() =>
                                setReturnDecisionTarget({
                                  returnId: ret.id,
                                  decision: "REJECT",
                                  returnRecord: ret,
                                })
                              }
                            >
                              <X size={15} /> Reject return
                            </Button>
                            <Button
                              size="sm"
                              onClick={() =>
                                setReturnDecisionTarget({
                                  returnId: ret.id,
                                  decision: "APPROVE",
                                  returnRecord: ret,
                                })
                              }
                            >
                              <Check size={15} /> Confirm & approve return
                            </Button>
                          </div>
                        )}
                      </article>
                    );
                  })}
                  </div>
                </>
              )}
            </section>
          )}

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
          setSelectedItemIds([]);
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
      <CancelReservationDialog
        open={cancelOpen}
        eventName={reservation.eventName}
        onClose={() => setCancelOpen(false)}
        onConfirm={confirmCancel}
      />
      <ConfirmDeliveryDialog
        open={deliveryConfirmOpen}
        reservation={reservation}
        initialSelectedItemId={singleDeliveryItemId}
        onClose={() => {
          setDeliveryConfirmOpen(false);
          setSingleDeliveryItemId(null);
        }}
        onConfirm={handleConfirmDelivery}
      />
      <ReturnDecisionDialog
        target={returnDecisionTarget}
        reservation={reservation}
        onClose={() => setReturnDecisionTarget(null)}
        onDecided={(result) => {
          setReservation(result);
          rememberReservation(result);
          setReturnDecisionTarget(null);
          setNoticeState("Return decision recorded");
        }}
      />
    </div>
  );
}

function CancelReservationDialog({
  open,
  eventName,
  onClose,
  onConfirm,
}: {
  open: boolean;
  eventName: string;
  onClose: () => void;
  onConfirm: (reason?: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await onConfirm(reason.trim() || undefined);
      onClose();
    } catch (caught) {
      setError(caught);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog
      open={open}
      title="Cancel reservation"
      description={`Are you sure you want to cancel "${eventName}"? All allocated assets will be released back into available inventory.`}
      onClose={onClose}
    >
      <form className="dialog-form" onSubmit={(event) => void submit(event)}>
        {Boolean(error) && <ErrorState error={error} />}
        <Field
          label="Reason for cancellation"
          hint="Optional — provide context for managers and requesters"
        >
          <Textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={2000}
            rows={3}
            placeholder="e.g. Event cancelled, date changed, or assets no longer needed"
          />
        </Field>
        <div className="dialog-actions">
          <Button type="button" variant="quiet" onClick={onClose}>
            Keep reservation
          </Button>
          <Button type="submit" variant="danger" loading={loading}>
            <XCircle size={17} />
            Confirm cancellation
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function ConfirmDeliveryDialog({
  open,
  reservation,
  initialSelectedItemId,
  onClose,
  onConfirm,
}: {
  open: boolean;
  reservation: ReservationDetail;
  initialSelectedItemId?: string | null;
  onClose: () => void;
  onConfirm: (itemIds?: string[]) => Promise<void>;
}) {
  const deliverableItems = useMemo(
    () =>
      reservation.items.filter((item) =>
        ["APPROVED", "PREPARED", "CHECKED_OUT"].includes(item.status),
      ),
    [reservation.items],
  );

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (open) {
      if (initialSelectedItemId) {
        setSelectedIds([initialSelectedItemId]);
      } else {
        setSelectedIds(deliverableItems.map((i) => i.id));
      }
      setError(null);
    }
  }, [open, initialSelectedItemId, deliverableItems]);

  function toggleItem(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  }

  function toggleAll() {
    if (selectedIds.length === deliverableItems.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(deliverableItems.map((i) => i.id));
    }
  }

  async function handleConfirm() {
    if (selectedIds.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      await onConfirm(
        selectedIds.length === deliverableItems.length
          ? undefined
          : selectedIds,
      );
      onClose();
    } catch (caught) {
      setError(caught);
    } finally {
      setLoading(false);
    }
  }

  const allWillBeDelivered =
    selectedIds.length === deliverableItems.length &&
    reservation.items
      .filter((i) => !["REJECTED", "PENDING"].includes(i.status))
      .every(
        (i) =>
          ["DELIVERED", "RETURNED"].includes(i.status) ||
          selectedIds.includes(i.id),
      );

  return (
    <Dialog
      open={open}
      title="Confirm equipment delivery"
      description={`Confirm receipt of approved equipment for "${reservation.eventName}".`}
      onClose={onClose}
    >
      <div className="dialog-form">
        {Boolean(error) && <ErrorState error={error} />}

        {deliverableItems.length > 1 && (
          <div className="delivery-selection-header">
            <label className="select-all-label">
              <input
                type="checkbox"
                checked={
                  deliverableItems.length > 0 &&
                  selectedIds.length === deliverableItems.length
                }
                onChange={toggleAll}
              />
              <span>
                Select all ({selectedIds.length}/{deliverableItems.length})
              </span>
            </label>
          </div>
        )}

        <div className="delivery-item-list">
          {deliverableItems.map((item) => {
            const isChecked = selectedIds.includes(item.id);
            return (
              <label
                key={item.id}
                className={cx(
                  "delivery-item-row",
                  isChecked && "is-selected",
                )}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => toggleItem(item.id)}
                />
                <div className="delivery-item-info">
                  <strong>{item.asset.name}</strong>
                  <span>
                    Qty: {item.quantity} · {item.asset.managementArea.name}
                  </span>
                </div>
                <ItemStatusBadge status={item.status} />
              </label>
            );
          })}
        </div>

        <p className="dialog-help">
          {allWillBeDelivered ? (
            <>
              Confirming delivery for all approved items will{" "}
              <strong>auto-advance the event status to Delivery Confirmed</strong>.
            </>
          ) : (
            <>
              Selected items will be updated to <strong>Delivered</strong>. The event status will automatically update to Delivery Confirmed once all equipment is confirmed.
            </>
          )}
        </p>
        <div className="dialog-actions">
          <Button type="button" variant="quiet" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            loading={loading}
            disabled={selectedIds.length === 0}
            onClick={() => void handleConfirm()}
          >
            <Truck size={17} /> Confirm delivery receipt (
            {selectedIds.length})
          </Button>
        </div>
      </div>
    </Dialog>
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
        `reservation-status--${status.toLowerCase().replace(/_/g, "-")}`,
      )}
    >
      <span />
      {reservationStatusLabel[status]}
    </span>
  );
}

type StepState = "done" | "active" | "upcoming";

type StepDef = {
  key: string;
  label: string;
  icon: React.ReactNode;
};

const RESERVATION_STEPS: StepDef[] = [
  { key: "approval", label: "Waiting for Approve", icon: <ShieldCheck size={16} /> },
  { key: "delivery", label: "Receive Confirmed", icon: <Truck size={16} /> },
  { key: "return", label: "Return", icon: <PackageCheck size={16} /> },
  { key: "complete", label: "Return Confirm", icon: <CheckCircle2 size={16} /> },
];

function getActiveStep(status: ReservationStatus): number {
  switch (status) {
    case "DRAFT":
    case "PENDING":
    case "PENDING_APPROVAL":
    case "PARTIALLY_APPROVED":
      return 0; // approval step is active
    case "APPROVED":
      return 1; // delivery step is active (waiting to be confirmed)
    case "DELIVERY_CONFIRMED":
    case "ACTIVE":
      return 2; // delivery done → return step is now active
    case "RETURN":
    case "RETURN_PENDING":
      return 2; // return submitted, waiting manager confirm
    case "RETURN_CONFIRMED":
    case "COMPLETED":
      return 3; // all done
    case "REJECTED":
    case "CANCELLED":
      return -1; // cancelled / failed
    default:
      return 0;
  }
}

function ReservationStepper({ status }: { status: ReservationStatus }) {
  const isCancelled = status === "CANCELLED" || status === "REJECTED";
  const isCompleted = status === "RETURN_CONFIRMED" || status === "COMPLETED";
  const activeStep = isCompleted ? 4 : getActiveStep(status);

  return (
    <div className={cx("reservation-stepper", isCancelled && "reservation-stepper--cancelled")}>
      {RESERVATION_STEPS.map((step, idx) => {
        const state: StepState = isCancelled
          ? "upcoming"
          : idx < activeStep
            ? "done"
            : idx === activeStep
              ? "active"
              : "upcoming";

        return (
          <div
            key={step.key}
            className={cx(
              "res-step",
              `res-step--${state}`,
            )}
          >
            {idx > 0 && (
              <div className={cx("res-step__connector", idx <= activeStep && !isCancelled && "res-step__connector--filled")} />
            )}
            <div className="res-step__node">
              <div className="res-step__circle">
                {state === "done" ? <Check size={13} strokeWidth={3} /> : step.icon}
              </div>
            </div>
            <div className="res-step__label">{step.label}</div>
          </div>
        );
      })}
      {isCancelled && (
        <div className="res-step res-step--cancelled-badge">
          <div className="res-step__connector" />
          <div className="res-step__node">
            <div className="res-step__circle">
              <X size={13} strokeWidth={3} />
            </div>
          </div>
          <div className="res-step__label">
            {status === "REJECTED" ? "Rejected" : "Cancelled"}
          </div>
        </div>
      )}
    </div>
  );
}

const itemLabels: Record<ReservationItemStatus, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  PREPARED: "Prepared",
  CHECKED_OUT: "Checked out",
  DELIVERED: "Delivered",
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
        await api.decideReservationItems(
          reservationId,
          target.itemIds,
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
      title={`${target?.decision === "APPROVE" ? "Approve" : "Reject"} ${target?.itemIds.length ?? 0} selected ${(target?.itemIds.length ?? 0) === 1 ? "asset" : "assets"}`}
      description={
        target?.decision === "APPROVE"
          ? "Availability will be checked for every selected asset before the batch is approved."
          : "Every selected asset will be rejected together."
      }
      onClose={onClose}
    >
      <form className="dialog-form" onSubmit={(event) => void submit(event)}>
        {error && (
          <div className="form-alert" role="alert">
            {error}
          </div>
        )}
        {target && (
          <div className="decision-asset-summary">
            <span>Selected manifest</span>
            <strong>{target.assetNames.join(" · ")}</strong>
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
            {target?.decision === "APPROVE"
              ? "Approve selected"
              : "Reject selected"}
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

function ReturnStatusBadge({ status }: { status: ReturnDetail["status"] }) {
  const labels: Record<ReturnDetail["status"], string> = {
    PENDING: "Pending Confirmation",
    APPROVED: "Confirmed",
    COMPLETED: "Confirmed & Completed",
    REJECTED: "Rejected",
  };
  return (
    <span
      className={cx(
        "return-status-badge",
        `return-status-badge--${status.toLowerCase()}`,
      )}
    >
      <span />
      {labels[status] ?? status}
    </span>
  );
}



function InlineReturnForm({
  reservation,
  selectedItemIds = [],
  onCancel,
  onSaved,
}: {
  reservation: ReservationDetail;
  selectedItemIds?: string[];
  onCancel?: () => void;
  onSaved: (result: ReservationDetail) => void;
}) {
  const allReturnableItems = useMemo(
    () =>
      reservation.items.filter(
        (item) =>
          item.status !== "REJECTED" &&
          item.status !== "PENDING" &&
          item.status !== "APPROVED" &&
          ((item.returnSummary
            ? item.returnSummary.remainingReturnQuantity > 0
            : item.quantity > 0) ||
            (item.returnSummary ? (item.returnSummary.lostQuantity ?? 0) > 0 : false)),
      ),
    [reservation.items],
  );

  const targetItems = useMemo(() => {
    if (selectedItemIds && selectedItemIds.length > 0) {
      const filtered = allReturnableItems.filter((item) =>
        selectedItemIds.includes(item.id),
      );
      if (filtered.length > 0) return filtered;
    }
    return allReturnableItems;
  }, [allReturnableItems, selectedItemIds]);

  const [returnQuantities, setReturnQuantities] = useState<Record<string, number>>({});
  const [generalNote, setGeneralNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  function getInitialQty(item: ReservationItem): number {
    const remaining = item.returnSummary
      ? item.returnSummary.remainingReturnQuantity
      : item.quantity;
    const lost = item.returnSummary ? (item.returnSummary.lostQuantity ?? 0) : 0;
    return remaining > 0 ? remaining : lost > 0 ? lost : 1;
  }

  useEffect(() => {
    const initial: Record<string, number> = {};
    targetItems.forEach((item) => {
      initial[item.id] = getInitialQty(item);
    });
    setReturnQuantities(initial);
    setGeneralNote("");
    setError(null);
  }, [targetItems]);

  const totalUnits = useMemo(() => {
    let sum = 0;
    targetItems.forEach((item) => {
      const qty =
        returnQuantities[item.id] !== undefined
          ? returnQuantities[item.id]
          : getInitialQty(item);
      sum += Number(qty) || 0;
    });
    return sum;
  }, [returnQuantities, targetItems]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const itemsToSubmit = targetItems
        .map((item) => {
          const defaultQty = getInitialQty(item);
          const qty =
            returnQuantities[item.id] !== undefined
              ? Number(returnQuantities[item.id])
              : defaultQty;
          return {
            reservationItemId: item.id,
            quantityReturned: qty,
            quantityBroken: 0,
            quantityLost: 0,
            description: undefined,
          };
        })
        .filter((item) => item.quantityReturned > 0);

      if (itemsToSubmit.length === 0) {
        throw new Error(
          "Please specify at least 1 unit to return.",
        );
      }

      await api.createReturn(reservation.id, {
        items: itemsToSubmit,
        note: generalNote.trim() || undefined,
      });

      const updated = await api.reservation(reservation.id);
      onSaved(updated);
    } catch (caught) {
      setError(caught);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="inline-return-form">
      <div className="inline-return-form__header">
        <div>
          <p className="eyebrow">Reservation / {reservation.id.slice(0, 8)}</p>
          <h2>Return request</h2>
          <p>
            Input the number of items returning. Area managers will inspect and detail item condition (Good, Broken, Lost) during return confirmation.
          </p>
        </div>
        {onCancel && (
          <Button type="button" variant="quiet" size="sm" onClick={onCancel}>
            <X size={14} /> Cancel
          </Button>
        )}
      </div>

      <form className="inline-return-form__body" onSubmit={(e) => void submit(e)}>
        {Boolean(error) && <ErrorState error={error} />}
        <div className="return-items-inputs">
          {targetItems.map((item) => {
            const remaining = item.returnSummary
              ? item.returnSummary.remainingReturnQuantity
              : item.quantity;
            const lost = item.returnSummary ? (item.returnSummary.lostQuantity ?? 0) : 0;
            const maxUnits = item.quantity;
            const defaultQty = getInitialQty(item);
            const currentQty =
              returnQuantities[item.id] !== undefined
                ? returnQuantities[item.id]
                : defaultQty;

            return (
              <div className="return-input-row return-input-row--simple" key={item.id}>
                <div className="return-input-row__asset">
                  <AssetPicture
                    src={item.asset.pictureUrl}
                    name={item.asset.name}
                  />
                  <div className="return-input-row__asset-info">
                    <strong>{item.asset.name}</strong>
                    <span>
                      {item.asset.managementArea.name} · {item.quantity} reserved
                      {item.returnSummary && item.returnSummary.returnedQuantity > 0 && ` (${item.returnSummary.returnedQuantity} already returned)`}
                      {lost > 0 && ` · ${lost} previously reported lost`}
                    </span>
                  </div>
                </div>

                <div className="return-input-row__qty-input">
                  <Field label="Return number" hint={`Max ${remaining > 0 ? remaining : maxUnits} remaining`}>
                    <Input
                      aria-label={`Return quantity for ${item.asset.name}`}
                      type="number"
                      min={0}
                      max={maxUnits}
                      value={currentQty}
                      onChange={(e) => {
                        const val = Math.max(0, Number(e.target.value));
                        setReturnQuantities((prev) => ({
                          ...prev,
                          [item.id]: val,
                        }));
                      }}
                    />
                  </Field>
                </div>
              </div>
            );
          })}
        </div>

        <Field label="Return notes (optional)">
          <Textarea
            rows={2}
            value={generalNote}
            onChange={(e) => setGeneralNote(e.target.value)}
            placeholder="e.g. Returned all equipment to storage cabinet A"
            maxLength={2000}
          />
        </Field>

        <div className="return-form-summary-bar">
          <div className="return-form-summary-counts">
            <span>Total to return:</span>
            <strong>{totalUnits} unit{totalUnits === 1 ? "" : "s"}</strong>
          </div>
        </div>

        <div className="inline-return-form__actions">
          {onCancel && (
            <Button type="button" variant="quiet" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button type="submit" loading={loading}>
            <PackageCheck size={17} /> Return confirm request
          </Button>
        </div>
      </form>
    </div>
  );
}


function getInitialDecisionState(item: ReturnItemDetail): { good: number; broken: number; lost: number; description: string } {
  return {
    good: item.quantityReturned,
    broken: item.quantityBroken,
    lost: item.quantityLost,
    description: item.description ?? "",
  };
}

function ReturnDecisionDialog({
  target,
  reservation,
  onClose,
  onDecided,
}: {
  target: {
    returnId: string;
    decision: "APPROVE" | "REJECT";
    returnRecord: ReturnDetail;
  } | null;
  reservation: ReservationDetail | null;
  onClose: () => void;
  onDecided: (detail: ReservationDetail) => void;
}) {
  const [description, setDescription] = useState("");
  const [itemCounts, setItemCounts] = useState<
    Record<
      string,
      {
        good: number;
        broken: number;
        lost: number;
        description: string;
      }
    >
  >({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (target) {
      const initial: Record<
        string,
        { good: number; broken: number; lost: number; description: string }
      > = {};
      target.returnRecord.items.forEach((item) => {
        initial[item.id] = getInitialDecisionState(item);
      });
      setItemCounts(initial);
      setDescription("");
      setError(null);
    }
  }, [target, reservation]);

  if (!target || !reservation) return null;

  const isApprove = target.decision === "APPROVE";

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!target || !reservation) return;
    setLoading(true);
    setError(null);

    try {
      const itemsPayload = isApprove
        ? target.returnRecord.items.map((item) => {
            const counts = itemCounts[item.id] ?? getInitialDecisionState(item);
            return {
              reservationItemId: item.reservationItemId,
              quantityReturned: Number(counts.good) || 0,
              quantityBroken: Number(counts.broken) || 0,
              quantityLost: Number(counts.lost) || 0,
              description: counts.description?.trim() || undefined,
            };
          })
        : undefined;

      await api.decideReturn(reservation.id, target.returnId, {
        decision: target.decision,
        items: itemsPayload,
        description: description.trim() || undefined,
      });
      const updated = await api.reservation(reservation.id);
      onDecided(updated);
      onClose();
    } catch (caught) {
      setError(caught);
    } finally {
      setLoading(false);
    }
  }


  return (
    <Dialog
      open={Boolean(target)}
      title={
        isApprove ? "Return confirm & physical inspection" : "Reject return request"
      }
      description={
        isApprove
          ? "Verify physical condition of equipment. Confirm or adjust the count of Good, Broken, and Lost units."
          : "Reject this return submission and request correction from the submitter."
      }
      onClose={onClose}
    >
      <form className="dialog-form" onSubmit={(e) => void submit(e)}>
        {Boolean(error) && <ErrorState error={error} />}

        <div className="return-confirm-info">
          <div className="return-confirm-info__row">
            <span>Reservation:</span>
            <strong>{reservation.eventName} (#{reservation.id.slice(0, 8)})</strong>
          </div>
          <div className="return-confirm-info__row">
            <span>Submitted by:</span>
            <strong>
              {target.returnRecord.returnedBy.name ?? target.returnRecord.returnedBy.email}
            </strong>
          </div>
          <div className="return-confirm-info__row">
            <span>Return slip:</span>
            <span>
              Return / {target.returnRecord.id.slice(0, 8)} · {formatDate(target.returnRecord.returnedAt ?? target.returnRecord.createdAt, true)}
            </span>
          </div>
        </div>

        {isApprove && (
          <div className="return-confirm-items">
            {target.returnRecord.items.map((item) => {
              const resItem = reservation.items.find(
                (it) => it.id === item.reservationItemId,
              );
              const totalReserved =
                resItem?.quantity ??
                (item.quantityReturned + item.quantityBroken + item.quantityLost);
              const counts = itemCounts[item.id] ?? {
                good: item.quantityReturned,
                broken: item.quantityBroken,
                lost: item.quantityLost,
                description: item.description ?? "",
              };

              return (
                <div key={item.id} className="return-confirm-item-card">
                  <div className="return-confirm-item-card__header">
                    {resItem && (
                      <AssetPicture
                        src={resItem.asset.pictureUrl}
                        name={item.assetName}
                      />
                    )}
                    <div>
                      <strong>{item.assetName}</strong>
                      <small>
                        {item.managementArea.name} · {totalReserved} reserved
                      </small>
                    </div>
                  </div>

                  <div className="return-declared-badge">
                    <span>Declared:</span>
                    <span className="return-tag return-tag--intact">{item.quantityReturned} good</span>
                    {item.quantityBroken > 0 && <span className="return-tag return-tag--broken">{item.quantityBroken} broken</span>}
                    {item.quantityLost > 0 && <span className="return-tag return-tag--lost">{item.quantityLost} lost</span>}
                    {item.description && <span style={{ fontStyle: "italic", marginLeft: 4 }}>"{item.description}"</span>}
                  </div>

                  <div className="return-confirm-counts-grid">
                    <div className="return-confirm-count-field return-confirm-count-field--good">
                      <label>Number of good</label>
                      <Input
                        aria-label={`Number of good for ${item.assetName}`}
                        type="number"
                        min={0}
                        max={totalReserved}
                        value={counts.good}
                        onChange={(e) => {
                          const val = Math.max(0, Number(e.target.value));
                          setItemCounts((prev) => ({
                            ...prev,
                            [item.id]: { ...counts, good: val },
                          }));
                        }}
                      />
                    </div>

                    <div className="return-confirm-count-field return-confirm-count-field--broken">
                      <label>Number of broken</label>
                      <Input
                        aria-label={`Number of broken for ${item.assetName}`}
                        type="number"
                        min={0}
                        max={totalReserved}
                        value={counts.broken}
                        onChange={(e) => {
                          const val = Math.max(0, Number(e.target.value));
                          setItemCounts((prev) => ({
                            ...prev,
                            [item.id]: { ...counts, broken: val },
                          }));
                        }}
                      />
                    </div>

                    <div className="return-confirm-count-field return-confirm-count-field--lost">
                      <label>Number of lost</label>
                      <Input
                        aria-label={`Number of lost for ${item.assetName}`}
                        type="number"
                        min={0}
                        max={totalReserved}
                        value={counts.lost}
                        onChange={(e) => {
                          const val = Math.max(0, Number(e.target.value));
                          setItemCounts((prev) => ({
                            ...prev,
                            [item.id]: { ...counts, lost: val },
                          }));
                        }}
                      />
                    </div>
                  </div>

                  <div className="return-impact-callout">
                    <span className="return-impact-pill return-impact-pill--good">
                      ✓ {counts.good} returned to storage
                    </span>
                    {counts.broken > 0 && (
                      <span className="return-impact-pill return-impact-pill--broken">
                        ⚙ {counts.broken} sent to repair log
                      </span>
                    )}
                    {counts.lost > 0 && (
                      <span className="return-impact-pill return-impact-pill--lost">
                        ✕ {counts.lost} deducted from stock
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <Field
          label="Inspector notes"
          hint={
            isApprove
              ? "Optional inspection notes or remarks"
              : "Reason for rejection"
          }
          required={!isApprove}
        >
          <Textarea
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={
              isApprove
                ? "e.g. All equipment inspected and stored back into storage cabinet"
                : "e.g. 1 unit missing from the package, please re-check"
            }
            required={!isApprove}
            maxLength={2000}
          />
        </Field>

        <div className="dialog-actions">
          <Button type="button" variant="quiet" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant={isApprove ? "primary" : "danger"}
            loading={loading}
          >
            {isApprove ? <Check size={17} /> : <X size={17} />}
            {isApprove ? "Return confirm" : "Reject return"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}



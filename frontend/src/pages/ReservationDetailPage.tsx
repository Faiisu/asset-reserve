import {
  ArrowLeft,
  Calendar,
  Clock,
  Package,
  User,
  Truck,
  RotateCcw,
  XCircle,
  Info,
  CheckCircle,
  Check,
  X,
  ClipboardCheck,
  Printer,
} from "lucide-react";
import { useEffect, useState, useCallback, useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { ReservationHorizontalTracker } from "../components/ReservationHorizontalTracker";
import { ReservationPrintDocument } from "../components/ReservationPrintDocument";
import {
  Avatar,
  Button,
  ErrorState,
  LoadingState,
  Notice,
  formatDate,
} from "../components/ui";
import {
  reservationDuration,
  reservationItemStatusLabel,
  reservationStatusLabel,
} from "../reservations";
import type {
  ReservationDetail,
  CreateReturnItemInput,
  DecideReturnItemInput,
  ReturnItemUnitCondition,
  AssetUnit,
} from "../types";

const RETURN_PHASE_STATUSES = [
  "DELIVERY_CONFIRMED",
  "ACTIVE",
  "RETURN_PENDING",
  "RETURN_CONFIRMED",
];

export function ReservationDetailPage() {
  const { reservationId } = useParams<{ reservationId: string }>();
  const navigate = useNavigate();
  const { hasAreaPermission } = useAuth();

  const [reservation, setReservation] = useState<ReservationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);

  // Selection states for manifest actions
  const [selectedDeliveryItemIds, setSelectedDeliveryItemIds] = useState<string[]>([]);
  const [selectedInspectItemIds, setSelectedInspectItemIds] = useState<string[]>([]);

  // Approval: ACTIVE serial units available per asset, and the units
  // currently checked per reservation item, keyed by item.id -- approving an
  // item assigns these units in the same request (§7.5), there is no
  // separate "prepare" step.
  const [decisionUnitOptions, setDecisionUnitOptions] = useState<
    Record<string, AssetUnit[]>
  >({});
  const [decisionUnitSelections, setDecisionUnitSelections] = useState<
    Record<string, string[]>
  >({});

  // Remarks / notes for each state -- approval comment is per-item since
  // Approve/Reject are now per-row actions, not a shared batch decision.
  const [approvalComments, setApprovalComments] = useState<Record<string, string>>({});
  const [inspectionComment, setInspectionComment] = useState("");

  // Drop-off: which CHECKED_OUT serial units the borrower is returning, keyed
  // by reservationItemUnitId.
  const [selectedReturnUnitIds, setSelectedReturnUnitIds] = useState<
    Record<string, boolean>
  >({});

  // Inspection: condition decided per serial unit, keyed by
  // reservationItemUnitId -- matches DecideReturnItemUnitDto, one entry per
  // unit (§8.3 of algorithms-and-validation.md: no quantity field exists).
  const [unitConditions, setUnitConditions] = useState<
    Record<string, ReturnItemUnitCondition>
  >({});

  // Fetch reservation data
  const loadReservation = useCallback(async () => {
    if (!reservationId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.reservation(reservationId);
      setReservation(data);

      // Default every checked-out (not-yet-claimed) serial unit to selected
      // for return.
      const initialReturnUnits: Record<string, boolean> = {};
      data.items.forEach((item) => {
        item.units
          .filter((unit) => unit.status === "CHECKED_OUT")
          .forEach((unit) => {
            initialReturnUnits[unit.id] = true;
          });
      });
      setSelectedReturnUnitIds(initialReturnUnits);

      // Initialize inspection state for the pending return slip: default
      // every undecided unit to GOOD, matching the backend's own default.
      const pendingReturn = data.returns.find(
        (ret) => ret.status === "PENDING" || ret.approval?.status === "PENDING",
      );
      const initialConditions: Record<string, ReturnItemUnitCondition> = {};
      if (pendingReturn && pendingReturn.items && pendingReturn.items.length > 0) {
        pendingReturn.items.forEach((item) => {
          item.units.forEach((unit) => {
            initialConditions[unit.reservationItemUnitId] =
              unit.condition ?? "GOOD";
          });
        });
        setSelectedInspectItemIds(pendingReturn.items.map((i) => i.reservationItemId));
      } else {
        setSelectedInspectItemIds([]);
      }
      setUnitConditions(initialConditions);

      // Fetch ACTIVE serial units for every asset with an item awaiting
      // approval -- approving assigns units in the same request (§7.5).
      const pendingItems = data.items.filter(
        (item) => item.status === "PENDING" && item.capabilities?.canApprove,
      );
      const distinctAssetIds = [...new Set(pendingItems.map((i) => i.asset.id))];
      if (distinctAssetIds.length > 0) {
        const results = await Promise.all(
          distinctAssetIds.map((assetId) =>
            api
              .assetUnits(assetId, { status: "ACTIVE", limit: 100 })
              .then((res) => [assetId, res.data] as const),
          ),
        );
        setDecisionUnitOptions(Object.fromEntries(results));
      } else {
        setDecisionUnitOptions({});
      }
      setDecisionUnitSelections({});
      setApprovalComments({});

      // Reset selection state
      setSelectedDeliveryItemIds([]);
    } catch (err: any) {
      setError(err.message ?? "Failed to load reservation details.");
    } finally {
      setLoading(false);
    }
  }, [reservationId]);

  useEffect(() => {
    loadReservation();
  }, [loadReservation]);

  // Approvable items helper (Area Manager)
  const approvableItems = useMemo(() => {
    if (!reservation) return [];
    return reservation.items.filter(
      (i) =>
        i.status === "PENDING" &&
        (i.capabilities?.canApprove ||
          hasAreaPermission("reservation:approve", i.asset.managementArea.id))
    );
  }, [reservation, hasAreaPermission]);

  // Deliverable items helper (Handover)
  const deliverableItems = useMemo(() => {
    if (!reservation) return [];
    return reservation.items.filter(
      (item) => item.capabilities?.canConfirmDelivery && item.status === "PREPARED",
    );
  }, [reservation]);

  // Returnable items helper (Pending Return)
  const returnableItems = useMemo(() => {
    if (!reservation) return [];
    const canReturnOverall = reservation.capabilities?.canReturn;
    return reservation.items.filter((item) => {
      const remaining =
        item.returnSummary?.remainingReturnQuantity ??
        (item.status === "DELIVERED" ? item.quantity : 0);
      const itemCanReturn =
        item.capabilities?.canReturn ?? canReturnOverall ?? false;
      return (
        itemCanReturn &&
        remaining > 0 &&
        (item.status === "DELIVERED" || RETURN_PHASE_STATUSES.includes(reservation.status))
      );
    });
  }, [reservation]);

  // Every CHECKED_OUT serial unit across returnable items -- return selection
  // is unit-based, not grouped by item (no item-level checkbox).
  const returnableUnitIds = useMemo(
    () =>
      returnableItems.flatMap((item) =>
        item.units.filter((unit) => unit.status === "CHECKED_OUT").map((unit) => unit.id),
      ),
    [returnableItems],
  );
  const selectedReturnUnitCount = returnableUnitIds.filter(
    (id) => selectedReturnUnitIds[id],
  ).length;

  const toggleSelectAllReturnUnits = () => {
    if (selectedReturnUnitCount === returnableUnitIds.length) {
      setSelectedReturnUnitIds((prev) => {
        const next = { ...prev };
        returnableUnitIds.forEach((id) => delete next[id]);
        return next;
      });
    } else {
      setSelectedReturnUnitIds((prev) => {
        const next = { ...prev };
        returnableUnitIds.forEach((id) => {
          next[id] = true;
        });
        return next;
      });
    }
  };

  // Pending return slip that requires inspection (Area Manager)
  const pendingInspectableReturn = useMemo(() => {
    if (!reservation || !reservation.returns) return null;
    return (
      reservation.returns.find(
        (ret) =>
          (ret.status === "PENDING" || ret.approval?.status === "PENDING") &&
          (ret.capabilities?.canApprove ||
            hasAreaPermission("return:approve", ret.items?.[0]?.managementArea?.id || ""))
      ) ?? null
    );
  }, [reservation, hasAreaPermission]);

  // Print PDF is available only when return is approved or partially approved
  const canPrintPdf = useMemo(() => {
    if (!reservation) return false;
    return (
      ["RETURN_CONFIRMED", "COMPLETED"].includes(reservation.status) ||
      Boolean(
        reservation.returns?.some(
          (ret) =>
            ret.status === "APPROVED" ||
            ret.status === "COMPLETED" ||
            ret.approval?.status === "APPROVED"
        )
      )
    );
  }, [reservation]);

  const toggleDecisionUnit = (itemId: string, assetUnitId: string) => {
    setDecisionUnitSelections((prev) => {
      const current = prev[itemId] ?? [];
      if (current.includes(assetUnitId)) {
        return { ...prev, [itemId]: current.filter((id) => id !== assetUnitId) };
      }
      const item = reservation?.items.find((i) => i.id === itemId);
      if (item && current.length >= item.quantity) return prev;
      return { ...prev, [itemId]: [...current, assetUnitId] };
    });
  };

  // Toggle selection for delivery handover
  const toggleDeliveryItemSelection = (itemId: string) => {
    setSelectedDeliveryItemIds((prev) =>
      prev.includes(itemId) ? prev.filter((id) => id !== itemId) : [...prev, itemId]
    );
  };

  const toggleSelectAllDeliverable = () => {
    if (selectedDeliveryItemIds.length === deliverableItems.length) {
      setSelectedDeliveryItemIds([]);
    } else {
      setSelectedDeliveryItemIds(deliverableItems.map((item) => item.id));
    }
  };

  // Toggle selection for inspection review
  const toggleInspectItemSelection = (itemId: string) => {
    setSelectedInspectItemIds((prev) =>
      prev.includes(itemId) ? prev.filter((id) => id !== itemId) : [...prev, itemId]
    );
  };

  const toggleSelectAllInspectable = () => {
    const inspectableIds = (pendingInspectableReturn?.items || []).map((i) => i.reservationItemId);
    if (selectedInspectItemIds.length === inspectableIds.length) {
      setSelectedInspectItemIds([]);
    } else {
      setSelectedInspectItemIds(inspectableIds);
    }
  };

  // Handle Area Manager Item Decision (Approve / Reject) -- per row, one
  // item at a time. Approval is unit-based (at least one serial required,
  // fewer than requested is a valid partial approval); reject is always
  // whole-item, no units involved.
  const handleDecideItem = async (
    itemId: string,
    decision: "APPROVE" | "REJECT",
  ) => {
    if (!reservation) return;
    const item = reservation.items.find((i) => i.id === itemId);
    if (!item) return;

    if (decision === "APPROVE") {
      const units = decisionUnitSelections[itemId] ?? [];
      if (units.length < 1) {
        setActionError(`Select at least one serial unit for ${item.asset.name}.`);
        return;
      }
    }

    setActionLoading(true);
    setActionError(null);
    setActionNotice(null);

    try {
      const comment = (approvalComments[itemId] ?? "").trim() || undefined;
      const updated = await api.decideReservationItems(
        reservation.id,
        [
          {
            reservationItemId: itemId,
            ...(decision === "APPROVE"
              ? { assetUnitIds: decisionUnitSelections[itemId] ?? [] }
              : {}),
          },
        ],
        decision,
        comment,
      );
      setReservation(updated);
      setApprovalComments((prev) => {
        const next = { ...prev };
        delete next[itemId];
        return next;
      });
      setActionNotice(
        `Successfully ${decision === "APPROVE" ? "approved" : "rejected"} ${item.asset.name}.`,
      );
    } catch (err: any) {
      setActionError(err.message ?? `Failed to ${decision.toLowerCase()} item.`);
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Delivery Confirm
  const handleConfirmDelivery = async () => {
    if (!reservation) return;
    if (selectedDeliveryItemIds.length === 0) {
      setActionError("Please select at least one item to confirm handover.");
      return;
    }
    setActionLoading(true);
    setActionError(null);
    setActionNotice(null);
    try {
      const updated = await api.confirmDelivery(
        reservation.id,
        selectedDeliveryItemIds,
      );
      setReservation(updated);
      setSelectedDeliveryItemIds([]);
      setActionNotice(
        `Handover confirmed for ${selectedDeliveryItemIds.length} item(s).`,
      );
    } catch (err: any) {
      setActionError(err.message ?? "Failed to confirm delivery.");
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Return Submit directly from Equipment Manifest
  const handleReturnSubmit = async () => {
    if (!reservation) return;

    const itemsToReturn: CreateReturnItemInput[] = returnableItems
      .map((i) => i.id)
      .map((itemId) => {
        const item = reservation.items.find((i) => i.id === itemId);
        const checkedOutUnitIds = (item?.units ?? [])
          .filter((unit) => unit.status === "CHECKED_OUT")
          .map((unit) => unit.id);
        const reservationItemUnitIds = checkedOutUnitIds.filter(
          (unitId) => selectedReturnUnitIds[unitId],
        );
        return { reservationItemId: itemId, reservationItemUnitIds };
      })
      .filter((line) => line.reservationItemUnitIds.length > 0);

    if (itemsToReturn.length === 0) {
      setActionError("Select at least one serial unit to return.");
      return;
    }

    setActionLoading(true);
    setActionError(null);
    setActionNotice(null);

    try {
      await api.createReturn(reservation.id, {
        items: itemsToReturn,
      });
      setActionNotice("Return slip submitted. Equipment room inspection pending.");
      await loadReservation();
    } catch (err: any) {
      setActionError(err.message ?? "Failed to submit return request.");
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Manager Return Slip Inspection Decision with Checklist
  const handleDecideReturn = async (decision: "APPROVE" | "REJECT") => {
    if (!reservation || !pendingInspectableReturn) return;
    setActionLoading(true);
    setActionError(null);
    setActionNotice(null);

    const targetReturnItems = (pendingInspectableReturn.items || []).filter((retItem) =>
      selectedInspectItemIds.length === 0 || selectedInspectItemIds.includes(retItem.reservationItemId)
    );

    const decidedItems: DecideReturnItemInput[] = targetReturnItems.map((retItem) => ({
      reservationItemId: retItem.reservationItemId,
      units: retItem.units.map((unit) => ({
        reservationItemUnitId: unit.reservationItemUnitId,
        condition: unitConditions[unit.reservationItemUnitId] ?? "GOOD",
      })),
    }));

    try {
      await api.decideReturn(reservation.id, pendingInspectableReturn.id, {
        decision,
        items: decidedItems.length > 0 ? decidedItems : undefined,
        description: inspectionComment.trim() || undefined,
      });
      setInspectionComment("");
      setActionNotice(
        `Return slip ${decision === "APPROVE" ? "approved" : "rejected"} successfully.`,
      );
      await loadReservation();
    } catch (err: any) {
      setActionError(err.message ?? `Failed to ${decision.toLowerCase()} return slip.`);
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Cancel
  const handleCancelReservation = async () => {
    if (!reservation) return;
    if (!window.confirm("Are you sure you want to cancel this reservation?")) return;
    setActionLoading(true);
    setActionError(null);
    setActionNotice(null);
    try {
      const updated = await api.cancelReservation(reservation.id);
      setReservation(updated);
      setActionNotice("Reservation cancelled successfully.");
    } catch (err: any) {
      setActionError(err.message ?? "Failed to cancel reservation.");
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="page-stack res-detail-layout">
        <LoadingState label="Loading reservation details..." />
      </div>
    );
  }

  if (error || !reservation) {
    return (
      <div className="page-stack res-detail-layout">
        <ErrorState
          error={error ?? "Could not find the requested reservation."}
          onRetry={loadReservation}
        />
      </div>
    );
  }

  const canCancel = reservation.capabilities?.canCancel;
  const statusClass = reservation.status.toLowerCase();
  const approvedItemCount = reservation.items.filter(
    (item) => item.approval?.status === "APPROVED",
  ).length;
  const startDate = new Date(reservation.startAt);
  const startMonth = new Intl.DateTimeFormat("en", { month: "short" })
    .format(startDate)
    .toUpperCase();
  const startDay = new Intl.DateTimeFormat("en", { day: "2-digit" }).format(startDate);

  return (
    <div className="page-stack res-detail-layout">
      {/* Top Breadcrumb / Navigation */}
      <div className="res-detail-top-nav">
        <Link to="/reservations" className="res-detail-back-link">
          <ArrowLeft size={16} />
          <span>Back to Reservations</span>
        </Link>
        <span className="res-detail-ref-id">
          Ref: {reservation.id}
        </span>
      </div>

      {/* Global Notices */}
      {actionNotice && (
        <Notice tone="success">
          {actionNotice}
        </Notice>
      )}
      {actionError && (
        <Notice tone="warning">
          {actionError}
        </Notice>
      )}

      {/* Hero Header Section */}
      <div className="res-detail-hero">
        <div className="res-detail-date-stamp" aria-label={`Starts ${formatDate(reservation.startAt, true)}`}>
          <span>{startMonth}</span>
          <strong>{startDay}</strong>
          <small>{startDate.getFullYear()}</small>
        </div>
        <div className="res-detail-hero-header">
          <div className="res-detail-title-group">
            <span className="res-detail-kicker">Reservation dispatch</span>
            <div className="res-detail-title-row">
              <h1>{reservation.eventName}</h1>
              <span className={`res-status-badge res-status-badge--${statusClass}`}>
                {reservationStatusLabel[reservation.status] ?? reservation.status}
              </span>
            </div>
            {reservation.description && (
              <p className="res-detail-description">
                {reservation.description}
              </p>
            )}
          </div>

          {/* Quick Primary Actions */}
          <div className="res-detail-hero-actions">
            {canPrintPdf && (
              <Button
                variant="secondary"
                onClick={() => setShowPrintModal(true)}
                disabled={actionLoading}
                id="print-reservation-btn"
                title="Print complete reservation & return slip (PDF)"
              >
                <Printer size={15} />
                <span>Print / PDF</span>
              </Button>
            )}

            {returnableItems.length > 0 && (
              <Button
                variant="primary"
                onClick={() => {
                  const manifestEl = document.getElementById("manifest-card");
                  manifestEl?.scrollIntoView({ behavior: "smooth" });
                }}
                disabled={actionLoading}
              >
                <RotateCcw size={15} />
                <span>Return Equipment</span>
              </Button>
            )}

            {canCancel && (
              <Button
                variant="danger"
                onClick={handleCancelReservation}
                disabled={actionLoading}
              >
                <XCircle size={15} />
                <span>Cancel</span>
              </Button>
            )}
          </div>
        </div>

        {/* Key Info Meta Grid */}
        <div className="res-detail-meta-grid">
          <div className="res-detail-meta-item">
            <Calendar size={18} />
            <div>
              <span className="res-detail-meta-label">Starts</span>
              <span className="res-detail-meta-value">
                {formatDate(reservation.startAt, true)}
              </span>
            </div>
          </div>

          <div className="res-detail-meta-item">
            <Clock size={18} />
            <div>
              <span className="res-detail-meta-label">Booking window</span>
              <span className="res-detail-meta-value">
                {reservationDuration(reservation.startAt, reservation.endAt)}
              </span>
            </div>
          </div>

          <div className="res-detail-meta-item">
            <User size={18} />
            <div>
              <span className="res-detail-meta-label">Requester</span>
              <span className="res-detail-meta-value">
                {reservation.requester.name ??
                  reservation.requester.email ??
                  "Unnamed user"}
              </span>
            </div>
          </div>

          <div className="res-detail-meta-item">
            <Package size={18} />
            <div>
              <span className="res-detail-meta-label">Equipment</span>
              <span className="res-detail-meta-value">
                {reservation.items.length} lines ({reservation.items.reduce((acc, it) => acc + it.quantity, 0)} units)
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 🚀 HORIZONTAL INTERACTIVE TRACKING STEPPER WITH AUDIT LOGS */}
      <ReservationHorizontalTracker reservation={reservation} />

      {/* Main Two-Column Layout */}
      <div className="res-detail-columns">
        {/* Left Column (2/3): Equipment Manifest & Unified Action Bars */}
        <div className="res-detail-stack">
          {/* Equipment Manifest Card */}
          <div className="res-card" id="manifest-card">
            <div className="res-card-header">
              <div>
                <h2>
                  <Package size={16} />
                  <span>Reserved Equipment Manifest</span>
                </h2>
                <p className="res-card-header__supporting">
                  {approvableItems.length > 0
                    ? `${approvedItemCount} of ${reservation.items.length} equipment lines approved`
                    : deliverableItems.length > 0
                      ? approvedItemCount === reservation.items.length
                        ? "All equipment approved for handover"
                        : `${deliverableItems.length} line(s) approved for equipment handover`
                      : returnableItems.length > 0
                        ? `${returnableItems.length} equipment line(s) pending return`
                        : pendingInspectableReturn
                          ? "Return Inspection • Verify returned equipment condition"
                          : reservation.status === "COMPLETED" || reservation.status === "RETURN_CONFIRMED"
                            ? "All equipment returned and restocked"
                            : "Equipment manifest summary"}
                </p>
              </div>

              {/* Action Select All Toggles -- Approve/Reject are per-row now, no batch selection */}
              {deliverableItems.length > 0 ? (
                <label className="approval-select-all">
                  <input
                    type="checkbox"
                    checked={
                      selectedDeliveryItemIds.length > 0 &&
                      selectedDeliveryItemIds.length === deliverableItems.length
                    }
                    onChange={toggleSelectAllDeliverable}
                    aria-label="Select all items for handover"
                  />
                  <span>Select all for handover ({deliverableItems.length})</span>
                </label>
              ) : returnableUnitIds.length > 0 ? (
                <label className="approval-select-all">
                  <input
                    type="checkbox"
                    checked={
                      selectedReturnUnitCount > 0 &&
                      selectedReturnUnitCount === returnableUnitIds.length
                    }
                    onChange={toggleSelectAllReturnUnits}
                    aria-label="Select all serial units for return"
                  />
                  <span>Select all for return ({returnableUnitIds.length})</span>
                </label>
              ) : pendingInspectableReturn && pendingInspectableReturn.items?.length ? (
                <label className="approval-select-all">
                  <input
                    type="checkbox"
                    checked={
                      selectedInspectItemIds.length > 0 &&
                      selectedInspectItemIds.length === pendingInspectableReturn.items.length
                    }
                    onChange={toggleSelectAllInspectable}
                    aria-label="Select all items for inspection"
                  />
                  <span>Select all for inspection ({pendingInspectableReturn.items.length})</span>
                </label>
              ) : null}
            </div>

            {/* 🚚 2. HANDOVER CONFIRMATION TOOLBAR */}
            {deliverableItems.length > 0 && (
              <div className="res-review-bar res-handover-bar">
                <div className="res-review-bar__title">
                  <Truck size={18} />
                  <span>
                    Handover confirmation ({selectedDeliveryItemIds.length} of {deliverableItems.length} selected)
                  </span>
                </div>
                <div className="res-review-bar__actions">
                  <Button
                    variant="primary"
                    disabled={actionLoading || selectedDeliveryItemIds.length === 0}
                    onClick={handleConfirmDelivery}
                  >
                    <Check size={14} />
                    <span>Confirm Handover</span>
                  </Button>
                </div>
              </div>
            )}

            {/* 🔄 3. RETURN EQUIPMENT TOOLBAR (PENDING RETURN STATE) */}
            {returnableItems.length > 0 && (
              <div className="res-review-bar res-return-bar">
                <div className="res-review-bar__title">
                  <RotateCcw size={18} />
                  <span>
                    Equipment Return ({selectedReturnUnitCount} of {returnableUnitIds.length} serial units selected)
                  </span>
                </div>
                <div className="res-review-bar__actions">
                  <Button
                    variant="primary"
                    disabled={actionLoading || selectedReturnUnitCount === 0}
                    onClick={handleReturnSubmit}
                  >
                    <RotateCcw size={14} />
                    <span>Submit Return ({selectedReturnUnitCount})</span>
                  </Button>
                </div>
              </div>
            )}

            {/* 📋 4. MANAGER RETURN INSPECTION REVIEW TOOLBAR */}
            {pendingInspectableReturn && (
              <div className="res-review-bar res-inspection-bar">
                <div className="res-review-bar__title">
                  <ClipboardCheck size={18} />
                  <span>
                    Return Inspection Review ({selectedInspectItemIds.length} of {pendingInspectableReturn.items?.length || reservation.items.length} selected)
                  </span>
                </div>
                <div className="res-review-bar__actions">
                  <input
                    type="text"
                    placeholder="Inspection remarks / condition note..."
                    value={inspectionComment}
                    onChange={(e) => setInspectionComment(e.target.value)}
                    className="control"
                    aria-label="Inspection remarks"
                  />
                  <Button
                    variant="primary"
                    disabled={actionLoading}
                    onClick={() => handleDecideReturn("APPROVE")}
                  >
                    <Check size={14} />
                    <span>Approve Return</span>
                  </Button>
                  <Button
                    variant="danger"
                    disabled={actionLoading}
                    onClick={() => handleDecideReturn("REJECT")}
                  >
                    <X size={14} />
                    <span>Reject Return</span>
                  </Button>
                </div>
              </div>
            )}

            {/* Manifest Table Header for Return Inspection */}
            {pendingInspectableReturn && (
              <div className="res-manifest-grid-header res-manifest-grid-header--inspection">
                <span className="res-grid-th res-grid-th--check"></span>
                <span className="res-grid-th res-grid-th--media"></span>
                <span className="res-grid-th res-grid-th--asset">Equipment & Area</span>
                <span className="res-grid-th res-grid-th--serials">
                  Condition per serial unit
                </span>
              </div>
            )}

            {/* Equipment Items List (Uniform across all 4 lifecycle states) */}
            <div className="res-manifest-list">
              {reservation.items.map((item) => {
                const itemStatusClass = item.status.toLowerCase();
                const isApprovable =
                  item.status === "PENDING" &&
                  (item.capabilities?.canApprove ||
                    hasAreaPermission("reservation:approve", item.asset.managementArea.id));
                const isDeliverySelectable = Boolean(
                  item.capabilities?.canConfirmDelivery && item.status === "PREPARED",
                );
                const remainingReturn =
                  item.returnSummary?.remainingReturnQuantity ??
                  (item.status === "DELIVERED" ? item.quantity : 0);
                const isReturnSelectable = Boolean(
                  (item.capabilities?.canReturn ?? reservation.capabilities?.canReturn) &&
                    remainingReturn > 0 &&
                    (item.status === "DELIVERED" ||
                      RETURN_PHASE_STATUSES.includes(reservation.status)),
                );

                const retItem = pendingInspectableReturn?.items?.find(
                  (ri) => ri.reservationItemId === item.id,
                );
                const isInspectSelectable = Boolean(
                  pendingInspectableReturn &&
                  (retItem || pendingInspectableReturn.items?.length === 0 || pendingInspectableReturn.status === "PENDING"),
                );

                const returnableUnits = item.units.filter(
                  (unit) => unit.status === "CHECKED_OUT",
                );

                const isDeliverySelected = selectedDeliveryItemIds.includes(item.id);
                const isReturnSelected = returnableUnits.some(
                  (unit) => selectedReturnUnitIds[unit.id],
                );
                const isInspectSelected = selectedInspectItemIds.includes(item.id);

                const isSelectable =
                  isApprovable || isDeliverySelectable || isReturnSelectable || isInspectSelectable;
                const isRejected = item.status === "REJECTED";
                const isDelivered = item.status === "DELIVERED";
                const isFullyReturned =
                  item.status === "RETURNED" ||
                  (item.returnSummary !== undefined &&
                    item.returnSummary.totalUnits > 0 &&
                    item.returnSummary.remainingReturnQuantity === 0 &&
                    ["RETURN_CONFIRMED", "COMPLETED"].includes(reservation.status));

                const inspectUnitCount = retItem?.units.length ?? 0;

                return (
                  <div
                    key={item.id}
                    className={`res-manifest-item ${
                      isSelectable ? "reservation-item-card--selectable" : ""
                    } ${
                      isApprovable ? "res-manifest-item--approve" : ""
                    } ${
                      isDeliverySelectable ? "reservation-item-card--handover" : ""
                    } ${
                      isReturnSelectable ? "res-manifest-item--return" : ""
                    } ${
                      isInspectSelectable ? "res-manifest-item--inspection" : ""
                    }`}
                    data-selected={(isDeliverySelected || isReturnSelected || isInspectSelected) || undefined}
                    data-status={itemStatusClass}
                    onClick={(e) => {
                      if (
                        isSelectable &&
                        !(e.target instanceof HTMLInputElement) &&
                        !(e.target instanceof HTMLButtonElement)
                      ) {
                        if (isDeliverySelectable) toggleDeliveryItemSelection(item.id);
                        else if (isInspectSelectable) toggleInspectItemSelection(item.id);
                      }
                    }}
                  >
                    {isSelectable ? (
                      <>
                        <div className="res-pending-check">
                          {!isApprovable && !isDeliverySelectable && !isReturnSelectable && (
                            <input
                              type="checkbox"
                              checked={isInspectSelected}
                              onChange={() => toggleInspectItemSelection(item.id)}
                              aria-label={`Select ${item.asset.name} for inspection`}
                              className="reservation-item-select"
                              onClick={(e) => e.stopPropagation()}
                            />
                          )}
                        </div>

                        <div className="res-item-media">
                          {item.asset.pictureUrl ? (
                            <img src={item.asset.pictureUrl} alt="" />
                          ) : (
                            <span>{item.asset.name.slice(0, 2).toUpperCase()}</span>
                          )}
                          {!isApprovable && (
                            <span className="res-item-media__clearance" aria-hidden="true">
                              <Check size={10} strokeWidth={3} />
                            </span>
                          )}
                        </div>

                        <div className="res-pending-identity">
                          <div className="res-item-copy">
                            <div className="res-item-name-row">
                              <div className="res-item-name">{item.asset.name}</div>
                              <span className="res-item-area">
                                {item.asset.managementArea.name}
                              </span>
                            </div>
                            <div className="res-item-sub">
                              {isInspectSelectable
                                ? `Returned by borrower (${inspectUnitCount} ${inspectUnitCount === 1 ? "unit" : "units"})`
                                : isReturnSelectable
                                  ? `Awaiting return (${remainingReturn} units remaining)`
                                  : isApprovable
                                    ? `Select serial unit (${decisionUnitSelections[item.id]?.length ?? 0} of ${item.quantity})`
                                  : isDeliverySelectable
                                    ? `Approved — awaiting handover`
                                    : `Awaiting Area Manager decision`}
                            </div>
                          </div>
                        </div>

                        {isInspectSelectable ? (
                          <div
                            className="res-inspect-serial-list"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {(retItem?.units ?? []).map((unit) => {
                              const condition =
                                unitConditions[unit.reservationItemUnitId] ?? "GOOD";
                              return (
                                <div
                                  key={unit.id}
                                  className="res-inspect-serial-row"
                                >
                                  <span className="res-inspect-serial-row__serial mono">
                                    {unit.serialNumber}
                                  </span>
                                  <div
                                    className="res-condition-toggle"
                                    role="radiogroup"
                                    aria-label={`Condition for serial ${unit.serialNumber}`}
                                  >
                                    {(["GOOD", "BROKEN", "LOST"] as const).map(
                                      (option) => (
                                        <button
                                          key={option}
                                          type="button"
                                          role="radio"
                                          aria-checked={condition === option}
                                          className={`res-condition-toggle__option res-condition-toggle__option--${option.toLowerCase()} ${
                                            condition === option ? "is-active" : ""
                                          }`}
                                          onClick={() =>
                                            setUnitConditions((prev) => ({
                                              ...prev,
                                              [unit.reservationItemUnitId]: option,
                                            }))
                                          }
                                        >
                                          {option === "GOOD"
                                            ? "Good"
                                            : option === "BROKEN"
                                              ? "Broken"
                                              : "Lost"}
                                        </button>
                                      ),
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="res-pending-quantity">
                            {isApprovable ? (
                              <div
                                className="res-return-serial-list"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {(decisionUnitOptions[item.asset.id] ?? []).map((unit) => {
                                  const selectedForItem = decisionUnitSelections[item.id] ?? [];
                                  const isChecked = selectedForItem.includes(unit.id);
                                  const atCap = selectedForItem.length >= item.quantity;
                                  return (
                                    <label
                                      key={unit.id}
                                      className="res-return-serial-row"
                                    >
                                      <input
                                        type="checkbox"
                                        checked={isChecked}
                                        disabled={!isChecked && atCap}
                                        onChange={() => toggleDecisionUnit(item.id, unit.id)}
                                        aria-label={`Assign serial ${unit.serialNumber}`}
                                      />
                                      <span className="mono">{unit.serialNumber}</span>
                                    </label>
                                  );
                                })}
                              </div>
                            ) : isDeliverySelectable ? (
                              <div
                                className="res-return-serial-list"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {item.units
                                  .filter((unit) => unit.status === "ASSIGNED")
                                  .map((unit) => (
                                    <label key={unit.id} className="res-return-serial-row">
                                      <input
                                        type="checkbox"
                                        checked={isDeliverySelected}
                                        onChange={() => toggleDeliveryItemSelection(item.id)}
                                        aria-label={`Select serial ${unit.serialNumber} for handover`}
                                      />
                                      <span className="mono">{unit.serialNumber}</span>
                                    </label>
                                  ))}
                              </div>
                            ) : isReturnSelectable ? (
                              <div
                                className="res-return-serial-list"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {returnableUnits.map((unit) => (
                                  <label
                                    key={unit.id}
                                    className="res-return-serial-row"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={Boolean(selectedReturnUnitIds[unit.id])}
                                      onChange={() =>
                                        setSelectedReturnUnitIds((prev) => ({
                                          ...prev,
                                          [unit.id]: !prev[unit.id],
                                        }))
                                      }
                                      aria-label={`Return serial ${unit.serialNumber}`}
                                    />
                                    <span className="mono">{unit.serialNumber}</span>
                                  </label>
                                ))}
                              </div>
                            ) : (
                              <>
                                <strong>{item.quantity}</strong>
                                <span>{item.quantity === 1 ? "unit" : "units"}</span>
                              </>
                            )}
                          </div>
                        )}

                        {isApprovable && (
                          <div
                            className="res-item-approve-actions"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              type="text"
                              placeholder="Comment (optional)"
                              value={approvalComments[item.id] ?? ""}
                              onChange={(e) =>
                                setApprovalComments((prev) => ({
                                  ...prev,
                                  [item.id]: e.target.value,
                                }))
                              }
                              className="control"
                              aria-label={`Approval comment for ${item.asset.name}`}
                            />
                            <Button
                              variant="primary"
                              disabled={
                                actionLoading ||
                                (decisionUnitSelections[item.id]?.length ?? 0) < 1
                              }
                              onClick={() => handleDecideItem(item.id, "APPROVE")}
                            >
                              <Check size={14} />
                              <span>Approve</span>
                            </Button>
                            <Button
                              variant="danger"
                              disabled={actionLoading}
                              onClick={() => handleDecideItem(item.id, "REJECT")}
                            >
                              <X size={14} />
                              <span>Reject</span>
                            </Button>
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <div className="res-item-info">
                          <div className="res-item-media">
                            {item.asset.pictureUrl ? (
                              <img src={item.asset.pictureUrl} alt="" />
                            ) : (
                              <span>{item.asset.name.slice(0, 2).toUpperCase()}</span>
                            )}
                            {isRejected ? (
                              <span className="res-item-media__rejected" aria-hidden="true">
                                <X size={10} strokeWidth={3} />
                              </span>
                            ) : item.status !== "PENDING" ? (
                              <span className="res-item-media__clearance" aria-hidden="true">
                                <Check size={10} strokeWidth={3} />
                              </span>
                            ) : null}
                          </div>

                          <div className="res-item-copy">
                            <div className="res-item-name-row">
                              <div className="res-item-name">{item.asset.name}</div>
                              <span className="res-item-area">
                                {item.asset.managementArea.name}
                              </span>
                            </div>
                            {item.status === "PREPARED" && item.approval ? (
                              <div className="res-item-clearance">
                                <CheckCircle size={14} />
                                <div>
                                  <span>
                                    Approved by{" "}
                                    {item.approval.approver.name ??
                                      item.approval.approver.email ??
                                      "a user"}
                                  </span>
                                  {item.approval.decidedAt && (
                                    <small>{formatDate(item.approval.decidedAt, true)}</small>
                                  )}
                                </div>
                              </div>
                            ) : isRejected ? (
                              <div className="res-item-clearance res-item-clearance--rejected">
                                <XCircle size={14} />
                                <div>
                                  <span>
                                    Rejected
                                    {item.approval
                                      ? ` by ${
                                          item.approval.approver.name ??
                                          item.approval.approver.email ??
                                          "a user"
                                        }`
                                      : ""}
                                  </span>
                                  {item.approval?.decidedAt && (
                                    <small>{formatDate(item.approval.decidedAt, true)}</small>
                                  )}
                                </div>
                              </div>
                            ) : isDelivered ? (
                              <div className="res-item-sub">
                                {item.returnSummary?.pendingReturnCount
                                  ? `Return slip submitted (${item.returnSummary.pendingReturnCount} units pending inspection)`
                                  : `Equipment handed over • Pending return`}
                              </div>
                            ) : isFullyReturned ? (
                              <div className="res-item-sub">All units returned and restocked in inventory</div>
                            ) : (
                              <div className="res-item-sub">Awaiting Area Manager decision</div>
                            )}
                            {item.approval?.comment && (
                              <blockquote className="res-item-comment">
                                {item.approval.comment}
                              </blockquote>
                            )}
                          </div>
                        </div>
                        <div className="res-item-controls">
                          <div className="res-item-qty-ticket">
                            <span>
                              {["PREPARED", "DELIVERED", "RETURNED"].includes(item.status)
                                ? "Approved qty"
                                : "Quantity"}
                            </span>
                            <strong>{item.quantity}</strong>
                            <small>{item.quantity === 1 ? "unit" : "units"}</small>
                          </div>
                          <div className="res-item-status-col">
                            <span className={`res-status-badge res-status-badge--${itemStatusClass}`}>
                              {isFullyReturned ? "Returned" : reservationItemStatusLabel[item.status]}
                            </span>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column (1/3): Participants & Help */}
        <aside className="res-detail-stack">
          {/* Participants Card */}
          <div className="res-card">
            <div className="res-card-header">
              <h3>
                <User size={16} />
                <span>Event Team & Participants</span>
              </h3>
            </div>
            <div className="res-team-list">
              <div className="res-team-member res-team-member--requester">
                <Avatar
                  name={reservation.requester.name ?? reservation.requester.email ?? "User"}
                />
                <div>
                  <div className="res-team-member__name">
                    {reservation.requester.name ?? "User"}
                  </div>
                  <div className="res-team-member__meta">
                    {reservation.requester.email ?? "Not linked yet"}
                  </div>
                </div>
                <span className="res-team-role">Requester</span>
              </div>

              {reservation.participants.map((p) => (
                <div key={p.id} className="res-team-member">
                  <Avatar name={p.name ?? p.email ?? "Participant"} />
                  <div>
                    <div className="res-team-member__name">
                      {p.name ?? "Participant"}
                    </div>
                    <div className="res-team-member__meta">
                      {p.email ?? "Not linked yet"}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Quick Help Card */}
          <div className="res-card res-help-card">
            <h4>
              <Info size={16} />
              <span>Reservation Lifecycle Help</span>
            </h4>
            <p>
              Manage all lifecycle actions (<strong>Approvals</strong>, <strong>Handover</strong>, and <strong>Equipment Returns</strong>) directly inside the <strong>Reserved Equipment Manifest</strong>.
            </p>
          </div>
        </aside>
      </div>

      {/* Interactive Print Preview Modal & Print Document */}
      {canPrintPdf && showPrintModal && (
        <ReservationPrintDocument
          reservation={reservation}
          onClose={() => setShowPrintModal(false)}
          isModal
        />
      )}
    </div>
  );
}

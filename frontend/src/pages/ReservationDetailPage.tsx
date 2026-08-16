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
  ShieldCheck,
  Check,
  X,
  ClipboardCheck,
  AlertTriangle,
} from "lucide-react";
import { useEffect, useState, useCallback, useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { ReservationHorizontalTracker } from "../components/ReservationHorizontalTracker";
import {
  Avatar,
  Button,
  ErrorState,
  LoadingState,
  Notice,
  formatDate,
} from "../components/ui";
import { reservationDuration, reservationStatusLabel } from "../reservations";
import type {
  ReservationDetail,
  CreateReturnItemInput,
} from "../types";

export type InspectionItemState = {
  quantityReturned: number;
  quantityBroken: number;
  quantityLost: number;
  isVerified: boolean;
  description: string;
};

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

  // Selection states for manifest actions
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [selectedDeliveryItemIds, setSelectedDeliveryItemIds] = useState<string[]>([]);
  const [selectedReturnItemIds, setSelectedReturnItemIds] = useState<string[]>([]);

  // Remarks / notes for each state
  const [approvalComment, setApprovalComment] = useState("");
  const [returnNote, setReturnNote] = useState("");
  const [inspectionComment, setInspectionComment] = useState("");

  // Quantity adjustments
  const [itemQuantities, setItemQuantities] = useState<Record<string, number>>({});
  const [returnQuantities, setReturnQuantities] = useState<Record<string, number>>({});
  const [inspectionItemStates, setInspectionItemStates] = useState<Record<string, InspectionItemState>>({});

  // Fetch reservation data
  const loadReservation = useCallback(async () => {
    if (!reservationId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.reservation(reservationId);
      setReservation(data);

      // Initialize return quantities & approvable item quantities
      const initialReturnQty: Record<string, number> = {};
      const initialItemQty: Record<string, number> = {};
      data.items.forEach((item) => {
        const remaining = item.returnSummary?.remainingReturnQuantity ?? item.quantity;
        initialReturnQty[item.id] = remaining > 0 ? remaining : item.quantity;
        initialItemQty[item.id] = item.quantity;
      });
      setReturnQuantities(initialReturnQty);
      setItemQuantities(initialItemQty);

      // Initialize inspection checklist states for pending return slips
      const pendingReturn = data.returns.find(
        (ret) => ret.status === "PENDING" || ret.approval?.status === "PENDING",
      );
      const initialInspection: Record<string, InspectionItemState> = {};
      if (pendingReturn && pendingReturn.items) {
        pendingReturn.items.forEach((item) => {
          initialInspection[item.reservationItemId] = {
            quantityReturned: item.quantityReturned,
            quantityBroken: item.quantityBroken ?? 0,
            quantityLost: item.quantityLost ?? 0,
            isVerified: true,
            description: item.description ?? "",
          };
        });
      }
      setInspectionItemStates(initialInspection);

      // Reset selection state
      setSelectedItemIds([]);
      setSelectedDeliveryItemIds([]);
      setSelectedReturnItemIds([]);
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
      (item) =>
        item.capabilities?.canConfirmDelivery &&
        ["APPROVED", "PREPARED", "CHECKED_OUT"].includes(item.status),
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
        (["DELIVERED", "APPROVED", "DELIVERY_CONFIRMED"].includes(item.status) ||
          ["DELIVERY_CONFIRMED", "ACTIVE"].includes(reservation.status))
      );
    });
  }, [reservation]);

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

  // Toggle selection for approval
  const toggleItemSelection = (itemId: string) => {
    setSelectedItemIds((prev) =>
      prev.includes(itemId) ? prev.filter((id) => id !== itemId) : [...prev, itemId]
    );
  };

  const toggleSelectAllApprovable = () => {
    if (selectedItemIds.length === approvableItems.length) {
      setSelectedItemIds([]);
    } else {
      setSelectedItemIds(approvableItems.map((i) => i.id));
    }
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

  // Toggle selection for equipment return
  const toggleReturnItemSelection = (itemId: string) => {
    setSelectedReturnItemIds((prev) =>
      prev.includes(itemId) ? prev.filter((id) => id !== itemId) : [...prev, itemId]
    );
  };

  const toggleSelectAllReturnable = () => {
    if (selectedReturnItemIds.length === returnableItems.length) {
      setSelectedReturnItemIds([]);
    } else {
      setSelectedReturnItemIds(returnableItems.map((item) => item.id));
    }
  };

  // Handle Area Manager Item Decision (Approve / Reject)
  const handleDecideItems = async (
    decision: "APPROVE" | "REJECT",
    targetItemIds?: string[]
  ) => {
    if (!reservation) return;
    const ids = targetItemIds ?? selectedItemIds;
    if (ids.length === 0) {
      setActionError("Please select at least one item to decide.");
      return;
    }

    setActionLoading(true);
    setActionError(null);
    setActionNotice(null);

    try {
      const updated = await api.decideReservationItems(
        reservation.id,
        ids,
        decision,
        approvalComment.trim() || undefined
      );
      setReservation(updated);
      setSelectedItemIds([]);
      setApprovalComment("");
      setActionNotice(
        `Successfully ${decision === "APPROVE" ? "approved" : "rejected"} ${ids.length} item(s).`
      );
    } catch (err: any) {
      setActionError(err.message ?? `Failed to ${decision.toLowerCase()} items.`);
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
    const targetIds =
      selectedReturnItemIds.length > 0
        ? selectedReturnItemIds
        : returnableItems.map((i) => i.id);

    if (targetIds.length === 0) {
      setActionError("Please select at least one item to return.");
      return;
    }

    const itemsToReturn: CreateReturnItemInput[] = targetIds.map((itemId) => {
      const item = reservation.items.find((i) => i.id === itemId);
      const remaining =
        item?.returnSummary?.remainingReturnQuantity ?? item?.quantity ?? 1;
      const qty = returnQuantities[itemId] ?? remaining;
      return {
        reservationItemId: itemId,
        quantityReturned: Math.max(1, Math.min(remaining, qty)),
        quantityBroken: 0,
        quantityLost: 0,
      };
    });

    setActionLoading(true);
    setActionError(null);
    setActionNotice(null);

    try {
      await api.createReturn(reservation.id, {
        items: itemsToReturn,
        note: returnNote.trim() || undefined,
      });
      setSelectedReturnItemIds([]);
      setReturnNote("");
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

    const decidedItems = (pendingInspectableReturn.items || []).map((retItem) => {
      const itemState = inspectionItemStates[retItem.reservationItemId] ?? {
        quantityReturned: retItem.quantityReturned,
        quantityBroken: retItem.quantityBroken ?? 0,
        quantityLost: retItem.quantityLost ?? 0,
        description: retItem.description ?? "",
        isVerified: true,
      };
      return {
        reservationItemId: retItem.reservationItemId,
        quantityReturned: itemState.quantityReturned,
        quantityBroken: itemState.quantityBroken,
        quantityLost: itemState.quantityLost,
        description: itemState.description.trim() || undefined,
      };
    });

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
      <div className="res-detail-layout">
        <LoadingState label="Loading reservation details..." />
      </div>
    );
  }

  if (error || !reservation) {
    return (
      <div className="res-detail-layout">
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
    (item) => item.status === "APPROVED",
  ).length;
  const startDate = new Date(reservation.startAt);
  const startMonth = new Intl.DateTimeFormat("en", { month: "short" })
    .format(startDate)
    .toUpperCase();
  const startDay = new Intl.DateTimeFormat("en", { day: "2-digit" }).format(startDate);

  return (
    <div className="res-detail-layout">
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
            {returnableItems.length > 0 && (
              <Button
                variant="primary"
                onClick={() => {
                  toggleSelectAllReturnable();
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
                {reservation.requester.name ?? reservation.requester.email}
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
                        ? "All equipment cleared for handover"
                        : `${deliverableItems.length} line(s) cleared for equipment handover`
                      : returnableItems.length > 0
                        ? `${returnableItems.length} equipment line(s) pending return`
                        : pendingInspectableReturn
                          ? "Return inspection checklist • Verify returned equipment condition"
                          : reservation.status === "COMPLETED" || reservation.status === "RETURN_CONFIRMED"
                            ? "All equipment returned and restocked"
                            : "Equipment manifest summary"}
                </p>
              </div>

              {/* Action Select All Toggles */}
              {approvableItems.length > 0 ? (
                <label className="approval-select-all">
                  <input
                    type="checkbox"
                    checked={
                      selectedItemIds.length > 0 &&
                      selectedItemIds.length === approvableItems.length
                    }
                    onChange={toggleSelectAllApprovable}
                    aria-label="Select all pending assets"
                  />
                  <span>Select all pending ({approvableItems.length})</span>
                </label>
              ) : deliverableItems.length > 0 ? (
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
              ) : returnableItems.length > 0 ? (
                <label className="approval-select-all">
                  <input
                    type="checkbox"
                    checked={
                      selectedReturnItemIds.length > 0 &&
                      selectedReturnItemIds.length === returnableItems.length
                    }
                    onChange={toggleSelectAllReturnable}
                    aria-label="Select all items for return"
                  />
                  <span>Select all for return ({returnableItems.length})</span>
                </label>
              ) : null}
            </div>

            {/* 🛡️ 1. AREA MANAGER BATCH DECISION TOOLBAR */}
            {approvableItems.length > 0 && (
              <div className="res-review-bar">
                <div className="res-review-bar__title">
                  <ShieldCheck size={18} color="var(--teal)" />
                  <span>
                    Area Manager Review ({selectedItemIds.length} of {approvableItems.length} selected)
                  </span>
                </div>

                <div className="res-review-bar__actions">
                  <input
                    type="text"
                    placeholder="Decision comment / remark..."
                    value={approvalComment}
                    onChange={(e) => setApprovalComment(e.target.value)}
                    className="control"
                    aria-label="Decision comment"
                  />

                  <Button
                    variant="primary"
                    disabled={actionLoading || selectedItemIds.length === 0}
                    onClick={() => handleDecideItems("APPROVE")}
                  >
                    <Check size={14} />
                    <span>Approve Selected</span>
                  </Button>

                  <Button
                    variant="danger"
                    disabled={actionLoading || selectedItemIds.length === 0}
                    onClick={() => handleDecideItems("REJECT")}
                  >
                    <X size={14} />
                    <span>Reject</span>
                  </Button>
                </div>
              </div>
            )}

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
                    Equipment Return ({selectedReturnItemIds.length} of {returnableItems.length} selected)
                  </span>
                </div>
                <div className="res-review-bar__actions">
                  <input
                    type="text"
                    placeholder="Drop-off location / return notes..."
                    value={returnNote}
                    onChange={(e) => setReturnNote(e.target.value)}
                    className="control"
                    aria-label="Return notes"
                  />
                  <Button
                    variant="primary"
                    disabled={actionLoading || selectedReturnItemIds.length === 0}
                    onClick={handleReturnSubmit}
                  >
                    <RotateCcw size={14} />
                    <span>Submit Return ({selectedReturnItemIds.length})</span>
                  </Button>
                </div>
              </div>
            )}

            {/* 📋 4. MANAGER RETURN INSPECTION CHECKLIST TOOLBAR */}
            {pendingInspectableReturn && (
              <div className="res-review-bar res-inspection-bar">
                <div className="res-review-bar__title">
                  <ClipboardCheck size={18} />
                  <span>
                    Return Inspection Review (Slip #{pendingInspectableReturn.id.slice(0, 8)})
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

            {/* 📋 RETURN APPROVAL INSPECTION CHECKLIST CARDS */}
            {pendingInspectableReturn && pendingInspectableReturn.items && pendingInspectableReturn.items.length > 0 && (
              <div className="res-checklist-section">
                <h4 style={{ margin: "0 0 4px", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--teal)" }}>
                  Inspection Checklist & Restock Manifest
                </h4>
                {pendingInspectableReturn.items.map((retItem) => {
                  const state = inspectionItemStates[retItem.reservationItemId] || {
                    quantityReturned: retItem.quantityReturned,
                    quantityBroken: 0,
                    quantityLost: 0,
                    isVerified: true,
                    description: "",
                  };

                  const isDamagedOrLost = (state.quantityBroken > 0 || state.quantityLost > 0);

                  return (
                    <div
                      key={retItem.id}
                      className="res-checklist-card"
                      data-verified={state.isVerified ? "true" : undefined}
                    >
                      <div className="res-checklist-header">
                        <div className="res-checklist-identity">
                          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                            <input
                              type="checkbox"
                              checked={state.isVerified}
                              onChange={(e) => {
                                setInspectionItemStates((prev) => ({
                                  ...prev,
                                  [retItem.reservationItemId]: {
                                    ...state,
                                    isVerified: e.target.checked,
                                  },
                                }));
                              }}
                              aria-label={`Verify ${retItem.assetName} return checklist`}
                            />
                            <div>
                              <div className="res-checklist-title">{retItem.assetName}</div>
                              <div className="res-checklist-meta">
                                Area: {retItem.managementArea?.name ?? "General"} • Returned by borrower: {retItem.quantityReturned} units
                              </div>
                            </div>
                          </label>
                        </div>
                        <div>
                          {isDamagedOrLost ? (
                            <span className="res-checklist-tag res-checklist-tag--warn">
                              <AlertTriangle size={12} />
                              <span>Damage/Loss Flagged</span>
                            </span>
                          ) : (
                            <span className="res-checklist-tag res-checklist-tag--ok">
                              <CheckCircle size={12} />
                              <span>Condition Intact</span>
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="res-checklist-grid">
                        <div className="res-checklist-field res-checklist-field--number">
                          <label>Intact Qty (OK)</label>
                          <input
                            type="number"
                            min={0}
                            max={retItem.quantityReturned}
                            value={state.quantityReturned}
                            aria-label={`Intact quantity for ${retItem.assetName}`}
                            onChange={(e) => {
                              const val = Math.max(0, parseInt(e.target.value) || 0);
                              setInspectionItemStates((prev) => ({
                                ...prev,
                                [retItem.reservationItemId]: { ...state, quantityReturned: val },
                              }));
                            }}
                            className="control"
                          />
                        </div>

                        <div className="res-checklist-field res-checklist-field--number">
                          <label>Broken Qty</label>
                          <input
                            type="number"
                            min={0}
                            value={state.quantityBroken}
                            aria-label={`Broken quantity for ${retItem.assetName}`}
                            onChange={(e) => {
                              const val = Math.max(0, parseInt(e.target.value) || 0);
                              setInspectionItemStates((prev) => ({
                                ...prev,
                                [retItem.reservationItemId]: { ...state, quantityBroken: val },
                              }));
                            }}
                            className="control"
                          />
                        </div>

                        <div className="res-checklist-field res-checklist-field--number">
                          <label>Lost Qty</label>
                          <input
                            type="number"
                            min={0}
                            value={state.quantityLost}
                            aria-label={`Lost quantity for ${retItem.assetName}`}
                            onChange={(e) => {
                              const val = Math.max(0, parseInt(e.target.value) || 0);
                              setInspectionItemStates((prev) => ({
                                ...prev,
                                [retItem.reservationItemId]: { ...state, quantityLost: val },
                              }));
                            }}
                            className="control"
                          />
                        </div>

                        <div className="res-checklist-field" style={{ gridColumn: "span 2" }}>
                          <label>Condition Notes / Remarks</label>
                          <input
                            type="text"
                            placeholder="e.g. Lens clean, minor wear on case"
                            value={state.description}
                            aria-label={`Condition note for ${retItem.assetName}`}
                            onChange={(e) => {
                              const val = e.target.value;
                              setInspectionItemStates((prev) => ({
                                ...prev,
                                [retItem.reservationItemId]: { ...state, description: val },
                              }));
                            }}
                            className="control"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Equipment Items List */}
            <div className="res-manifest-list">
              {reservation.items.map((item) => {
                const itemStatusClass = item.status.toLowerCase();
                const isApprovable =
                  item.status === "PENDING" &&
                  (item.capabilities?.canApprove ||
                    hasAreaPermission("reservation:approve", item.asset.managementArea.id));
                const isDeliverySelectable = Boolean(
                  item.capabilities?.canConfirmDelivery &&
                    ["APPROVED", "PREPARED", "CHECKED_OUT"].includes(item.status),
                );
                const remainingReturn =
                  item.returnSummary?.remainingReturnQuantity ??
                  (item.status === "DELIVERED" ? item.quantity : 0);
                const isReturnSelectable = Boolean(
                  (item.capabilities?.canReturn ?? reservation.capabilities?.canReturn) &&
                    remainingReturn > 0 &&
                    (["DELIVERED", "APPROVED", "DELIVERY_CONFIRMED"].includes(item.status) ||
                      ["DELIVERY_CONFIRMED", "ACTIVE"].includes(reservation.status)),
                );

                const isSelected = selectedItemIds.includes(item.id);
                const isDeliverySelected = selectedDeliveryItemIds.includes(item.id);
                const isReturnSelected = selectedReturnItemIds.includes(item.id);
                const isSelectable = isApprovable || isDeliverySelectable || isReturnSelectable;
                const isApproved = item.status === "APPROVED";
                const isDelivered =
                  item.status === "DELIVERED" ||
                  ["DELIVERY_CONFIRMED", "ACTIVE"].includes(reservation.status);
                const isFullyReturned =
                  item.status === "RETURNED" ||
                  (item.returnSummary?.returnedQuantity === item.quantity &&
                    ["RETURN_CONFIRMED", "COMPLETED"].includes(reservation.status));

                return (
                  <div
                    key={item.id}
                    className={`res-manifest-item ${
                      isSelectable ? "reservation-item-card--selectable" : ""
                    } ${
                      isDeliverySelectable ? "reservation-item-card--handover" : ""
                    } ${
                      isReturnSelectable ? "res-manifest-item--return" : ""
                    }`}
                    data-selected={(isSelected || isDeliverySelected || isReturnSelected) || undefined}
                    data-status={itemStatusClass}
                    onClick={(e) => {
                      if (
                        isSelectable &&
                        !(e.target instanceof HTMLInputElement) &&
                        !(e.target instanceof HTMLButtonElement)
                      ) {
                        if (isApprovable) toggleItemSelection(item.id);
                        else if (isDeliverySelectable) toggleDeliveryItemSelection(item.id);
                        else if (isReturnSelectable) toggleReturnItemSelection(item.id);
                      }
                    }}
                  >
                    {isSelectable ? (
                      <>
                        <div className="res-pending-check">
                          <input
                            type="checkbox"
                            checked={
                              isApprovable
                                ? isSelected
                                : isDeliverySelectable
                                  ? isDeliverySelected
                                  : isReturnSelected
                            }
                            onChange={() => {
                              if (isApprovable) toggleItemSelection(item.id);
                              else if (isDeliverySelectable) toggleDeliveryItemSelection(item.id);
                              else if (isReturnSelectable) toggleReturnItemSelection(item.id);
                            }}
                            aria-label={
                              isApprovable
                                ? `Select ${item.asset.name}`
                                : isDeliverySelectable
                                  ? `Select ${item.asset.name} for handover`
                                  : `Select ${item.asset.name} for return`
                            }
                            className="reservation-item-select"
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>

                        <div className="res-item-media">
                          {item.asset.pictureUrl ? (
                            <img src={item.asset.pictureUrl} alt="" />
                          ) : (
                            <span>{item.asset.name.slice(0, 2).toUpperCase()}</span>
                          )}
                          {isApproved && (
                            <span className="res-item-media__clearance" aria-hidden="true">
                              <Check size={10} strokeWidth={3} />
                            </span>
                          )}
                        </div>

                        <div className="res-pending-identity">
                          <div className="res-item-copy">
                            <div className="res-item-name">{item.asset.name}</div>
                            <div className="res-item-sub">
                              {item.asset.managementArea.name}
                              {isReturnSelectable && ` • Awaiting return (${remainingReturn} units remaining)`}
                              {isDeliverySelectable && ` • Cleared for handover`}
                              {isApprovable && ` • Awaiting area clearance`}
                            </div>
                          </div>
                        </div>

                        <div className="res-pending-quantity">
                          {isApprovable ? (
                            <>
                              <input
                                id={`approve-qty-${item.id}`}
                                aria-label={`Approve quantity for ${item.asset.name}`}
                                type="number"
                                min={1}
                                max={item.quantity}
                                value={itemQuantities[item.id] ?? item.quantity}
                                onChange={(e) => {
                                  const val = Math.min(
                                    item.quantity,
                                    Math.max(1, parseInt(e.target.value) || 1),
                                  );
                                  setItemQuantities((prev) => ({ ...prev, [item.id]: val }));
                                }}
                                onClick={(e) => e.stopPropagation()}
                                className="control"
                              />
                              <span aria-label={`${item.quantity} total reserved`}>
                                / {item.quantity}
                              </span>
                            </>
                          ) : isReturnSelectable ? (
                            <>
                              <input
                                id={`return-qty-${item.id}`}
                                aria-label={`Return quantity for ${item.asset.name}`}
                                type="number"
                                min={1}
                                max={remainingReturn}
                                value={returnQuantities[item.id] ?? remainingReturn}
                                onChange={(e) => {
                                  const val = Math.min(
                                    remainingReturn,
                                    Math.max(1, parseInt(e.target.value) || 1),
                                  );
                                  setReturnQuantities((prev) => ({ ...prev, [item.id]: val }));
                                }}
                                onClick={(e) => e.stopPropagation()}
                                className="control"
                                style={{ width: 64, height: 32, textAlign: "center", fontWeight: 700 }}
                              />
                              <span aria-label={`${remainingReturn} remaining to return`}>
                                / {remainingReturn}
                              </span>
                            </>
                          ) : (
                            <>
                              <strong>{item.quantity}</strong>
                              <span>{item.quantity === 1 ? "unit" : "units"}</span>
                            </>
                          )}
                        </div>
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
                            {isApproved && (
                              <span className="res-item-media__clearance" aria-hidden="true">
                                <Check size={10} strokeWidth={3} />
                              </span>
                            )}
                          </div>

                          <div className="res-item-copy">
                            <div className="res-item-name-row">
                              <div className="res-item-name">{item.asset.name}</div>
                              <span className="res-item-area">
                                {item.asset.managementArea.name}
                              </span>
                            </div>
                            {isApproved && item.approval ? (
                              <div className="res-item-clearance">
                                <CheckCircle size={14} />
                                <div>
                                  <span>
                                    Cleared by {item.approval.approver.name ?? item.approval.approver.email}
                                  </span>
                                  {item.approval.decidedAt && (
                                    <small>{formatDate(item.approval.decidedAt, true)}</small>
                                  )}
                                </div>
                              </div>
                            ) : isDelivered ? (
                              <div className="res-item-sub">
                                {item.returnSummary?.pendingReturnQuantity
                                  ? `Return slip submitted (${item.returnSummary.pendingReturnQuantity} units pending inspection)`
                                  : `Equipment handed over • Pending return`}
                              </div>
                            ) : isFullyReturned ? (
                              <div className="res-item-sub">All units returned and restocked in inventory</div>
                            ) : (
                              <div className="res-item-sub">Awaiting area clearance</div>
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
                            <span>{isApproved ? "Approved qty" : "Quantity"}</span>
                            <strong>{item.quantity}</strong>
                            <small>{item.quantity === 1 ? "unit" : "units"}</small>
                          </div>
                          <div className="res-item-status-col">
                            <span className={`res-status-badge res-status-badge--${itemStatusClass}`}>
                              {isApproved
                                ? "Cleared"
                                : isFullyReturned
                                  ? "Returned"
                                  : isDelivered
                                    ? "Pending Return"
                                    : item.status}
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

          {/* Return History Slips (If any) */}
          {reservation.returns.length > 0 && (
            <div className="res-card">
              <div className="res-card-header">
                <h3>
                  <RotateCcw size={16} />
                  <span>Return & Inspection Slips</span>
                </h3>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {reservation.returns.map((ret) => {
                  const retStatusClass = ret.status.toLowerCase();
                  return (
                    <div key={ret.id} style={{ padding: "12px 16px", background: "var(--surface-raised)", borderRadius: 8, border: "1px solid var(--line)", fontSize: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontWeight: 700 }}>
                        <span>Slip ID: {ret.id.slice(0, 8)}</span>
                        <span className={`res-status-badge res-status-badge--${retStatusClass}`}>
                          {ret.status}
                        </span>
                      </div>
                      <p style={{ margin: "4px 0 0", color: "var(--ink-faint)" }}>
                        Submitted at: {formatDate(ret.createdAt, true)} • Returned by: {ret.returnedBy?.name ?? ret.returnedBy?.email ?? "Borrower"}
                      </p>
                      {ret.approval?.description && (
                        <p style={{ margin: "8px 0 0", padding: "8px 10px", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 6, color: "var(--ink-soft)" }}>
                          <strong>Inspector Remarks:</strong> {ret.approval.description}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
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
                <Avatar name={reservation.requester.name ?? reservation.requester.email} />
                <div>
                  <div className="res-team-member__name">
                    {reservation.requester.name ?? "User"}
                  </div>
                  <div className="res-team-member__meta">
                    {reservation.requester.email}
                  </div>
                </div>
                <span className="res-team-role">Requester</span>
              </div>

              {reservation.participants.map((p) => (
                <div key={p.id} className="res-team-member">
                  <Avatar name={p.name ?? p.email} />
                  <div>
                    <div className="res-team-member__name">
                      {p.name ?? "Participant"}
                    </div>
                    <div className="res-team-member__meta">
                      {p.email}
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
    </div>
  );
}

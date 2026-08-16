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

export function ReservationDetailPage() {
  const { reservationId } = useParams<{ reservationId: string }>();
  const navigate = useNavigate();
  const { session, hasAreaPermission } = useAuth();

  const [reservation, setReservation] = useState<ReservationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Area Manager Approval Selection State
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [approvalComment, setApprovalComment] = useState("");
  const [itemQuantities, setItemQuantities] = useState<Record<string, number>>({});

  // Return dialog state
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
  const [returnNote, setReturnNote] = useState("");
  const [returnQuantities, setReturnQuantities] = useState<Record<string, number>>({});

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
        initialReturnQty[item.id] = remaining > 0 ? remaining : 0;
        initialItemQty[item.id] = item.quantity;
      });
      setReturnQuantities(initialReturnQty);
      setItemQuantities(initialItemQty);

      // Default select all pending items that actor can approve
      const approvableIds = data.items
        .filter(
          (i) =>
            i.status === "PENDING" &&
            (i.capabilities?.canApprove ||
              hasAreaPermission("reservation:approve", i.asset.managementArea.id))
        )
        .map((i) => i.id);
      setSelectedItemIds(approvableIds);
    } catch (err: any) {
      setError(err.message ?? "Failed to load reservation details.");
    } finally {
      setLoading(false);
    }
  }, [reservationId]);

  useEffect(() => {
    loadReservation();
  }, [loadReservation]);

  // Approvable items helper
  const approvableItems = useMemo(() => {
    if (!reservation) return [];
    return reservation.items.filter(
      (i) =>
        i.status === "PENDING" &&
        (i.capabilities?.canApprove ||
          hasAreaPermission("reservation:approve", i.asset.managementArea.id))
    );
  }, [reservation, hasAreaPermission]);

  // Toggle selection for a single item
  const toggleItemSelection = (itemId: string) => {
    setSelectedItemIds((prev) =>
      prev.includes(itemId)
        ? prev.filter((id) => id !== itemId)
        : [...prev, itemId]
    );
  };

  // Toggle select all approvable items
  const toggleSelectAllApprovable = () => {
    if (selectedItemIds.length === approvableItems.length) {
      setSelectedItemIds([]);
    } else {
      setSelectedItemIds(approvableItems.map((i) => i.id));
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
    setActionLoading(true);
    setActionError(null);
    setActionNotice(null);
    try {
      const updated = await api.confirmDelivery(reservation.id);
      setReservation(updated);
      setActionNotice("Equipment handover confirmed successfully.");
    } catch (err: any) {
      setActionError(err.message ?? "Failed to confirm delivery.");
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Return Submit
  const handleReturnSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reservation) return;
    setActionLoading(true);
    setActionError(null);
    setActionNotice(null);

    const itemsToReturn: CreateReturnItemInput[] = Object.entries(returnQuantities)
      .filter(([_, qty]) => qty > 0)
      .map(([itemId, qty]) => ({
        reservationItemId: itemId,
        quantityReturned: qty,
        quantityBroken: 0,
        quantityLost: 0,
      }));

    if (itemsToReturn.length === 0) {
      setActionError("Please specify at least 1 item to return.");
      setActionLoading(false);
      return;
    }

    try {
      await api.createReturn(reservation.id, {
        items: itemsToReturn,
        note: returnNote || undefined,
      });
      setIsReturnModalOpen(false);
      setReturnNote("");
      setActionNotice("Return request slip submitted. Awaiting manager inspection.");
      await loadReservation();
    } catch (err: any) {
      setActionError(err.message ?? "Failed to submit return request.");
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

  const canConfirmDelivery = reservation.capabilities?.canConfirmDelivery;
  const canReturn = reservation.capabilities?.canReturn;
  const canCancel = reservation.capabilities?.canCancel;

  const statusClass = reservation.status.toLowerCase();

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
        <div className="res-detail-hero-header">
          <div className="res-detail-title-group">
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
            {canConfirmDelivery && (
              <Button
                variant="primary"
                onClick={handleConfirmDelivery}
                disabled={actionLoading}
              >
                <Truck size={15} />
                <span>Confirm Delivery (Pickup)</span>
              </Button>
            )}

            {canReturn && (
              <Button
                variant="primary"
                onClick={() => setIsReturnModalOpen(true)}
                disabled={actionLoading}
              >
                <RotateCcw size={15} />
                <span>Return Gear</span>
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
              <span className="res-detail-meta-label">Schedule Window</span>
              <span className="res-detail-meta-value">
                {formatDate(reservation.startAt, true)}
              </span>
            </div>
          </div>

          <div className="res-detail-meta-item">
            <Clock size={18} />
            <div>
              <span className="res-detail-meta-label">Duration</span>
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
              <span className="res-detail-meta-label">Equipment Count</span>
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
        {/* Left Column (2/3): Equipment Manifest & Approvals */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Equipment Manifest Card */}
          <div className="res-card">
            <div className="res-card-header">
              <h2>
                <Package size={16} />
                <span>Reserved Equipment Manifest</span>
              </h2>

              {/* Area Manager Select All Toggle */}
              {approvableItems.length > 0 && (
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
              )}
            </div>

            {/* 🛡️ AREA MANAGER BATCH DECISION TOOLBAR */}
            {approvableItems.length > 0 && (
              <div
                style={{
                  background: "var(--surface-raised)",
                  border: "1px solid var(--line)",
                  borderRadius: 10,
                  padding: "12px 16px",
                  marginBottom: 14,
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <ShieldCheck size={18} color="var(--teal)" />
                  <span style={{ fontSize: 12, fontWeight: 700, color: "var(--ink)" }}>
                    Area Manager Review ({selectedItemIds.length} of {approvableItems.length} selected)
                  </span>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 260, justifyContent: "flex-end" }}>
                  <input
                    type="text"
                    placeholder="Decision comment / remark..."
                    value={approvalComment}
                    onChange={(e) => setApprovalComment(e.target.value)}
                    className="control"
                    style={{ height: 34, fontSize: 12, maxWidth: 240 }}
                  />

                  <Button
                    variant="primary"
                    disabled={actionLoading || selectedItemIds.length === 0}
                    onClick={() => handleDecideItems("APPROVE")}
                    style={{ height: 34, padding: "0 14px", fontSize: 12, gap: 4 }}
                  >
                    <Check size={14} />
                    <span>Approve Selected</span>
                  </Button>

                  <Button
                    variant="danger"
                    disabled={actionLoading || selectedItemIds.length === 0}
                    onClick={() => handleDecideItems("REJECT")}
                    style={{ height: 34, padding: "0 14px", fontSize: 12, gap: 4 }}
                  >
                    <X size={14} />
                    <span>Reject</span>
                  </Button>
                </div>
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
                const isSelected = selectedItemIds.includes(item.id);

                return (
                  <div
                    key={item.id}
                    className={`res-manifest-item ${
                      isApprovable ? "reservation-item-card--selectable" : ""
                    }`}
                    style={
                      isSelected
                        ? { background: "color-mix(in srgb, var(--teal-soft) 25%, var(--surface))" }
                        : {}
                    }
                    onClick={(e) => {
                      // Toggle checkbox on row click if approvable
                      if (
                        isApprovable &&
                        !(e.target instanceof HTMLInputElement) &&
                        !(e.target instanceof HTMLButtonElement)
                      ) {
                        toggleItemSelection(item.id);
                      }
                    }}
                  >
                    <div className="res-item-info">
                      {/* Checkbox for Area Manager */}
                      {isApprovable && (
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleItemSelection(item.id)}
                          aria-label={`Select ${item.asset.name}`}
                          className="reservation-item-select"
                          onClick={(e) => e.stopPropagation()}
                        />
                      )}

                      <div className="res-item-icon">
                        {item.asset.name.slice(0, 2).toUpperCase()}
                      </div>

                      <div>
                        <div className="res-item-name">{item.asset.name}</div>
                        <div className="res-item-sub">
                          Area: {item.asset.managementArea.name}
                        </div>
                        {item.approval?.comment && (
                          <div className="res-item-comment">
                            Approver note: "{item.approval.comment}"
                          </div>
                        )}
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                      {/* Quantity Input Box for Approvable Items */}
                      {isApprovable ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <label style={{ fontSize: 11, color: "var(--ink-faint)", fontWeight: 600 }}>
                            Approve Qty:
                          </label>
                          <input
                            type="number"
                            min={1}
                            max={item.quantity}
                            value={itemQuantities[item.id] ?? item.quantity}
                            onChange={(e) => {
                              const val = Math.max(1, parseInt(e.target.value) || 1);
                              setItemQuantities((prev) => ({ ...prev, [item.id]: val }));
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="control"
                            style={{ width: 60, height: 32, textAlign: "center", fontWeight: 700, fontSize: 12 }}
                          />
                          <span style={{ fontSize: 11, color: "var(--ink-faint)" }}>/ {item.quantity}</span>
                        </div>
                      ) : (
                        <span className="res-item-qty">
                          Qty: {item.quantity} unit(s)
                        </span>
                      )}

                      <div className="res-item-status-col">
                        <span className={`res-status-badge res-status-badge--${itemStatusClass}`}>
                          {item.status}
                        </span>

                        {/* Inline Decision Buttons for single item */}
                        {isApprovable && (
                          <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                            <Button
                              variant="secondary"
                              size="sm"
                              disabled={actionLoading}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDecideItems("APPROVE", [item.id]);
                              }}
                              style={{ height: 26, padding: "0 8px", fontSize: 10, gap: 2 }}
                            >
                              <Check size={11} color="var(--green)" />
                              <span>Approve</span>
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={actionLoading}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDecideItems("REJECT", [item.id]);
                              }}
                              style={{ height: 26, padding: "0 8px", fontSize: 10, color: "var(--red)" }}
                            >
                              <X size={11} />
                              <span>Reject</span>
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
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
                        Submitted at: {formatDate(ret.createdAt, true)}
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
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Participants Card */}
          <div className="res-card">
            <div className="res-card-header">
              <h3>
                <User size={16} />
                <span>Event Team & Participants</span>
              </h3>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Avatar name={reservation.requester.name ?? reservation.requester.email} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>
                    {reservation.requester.name ?? "User"}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--ink-faint)" }}>
                    {reservation.requester.email} (Requester)
                  </div>
                </div>
              </div>

              {reservation.participants.map((p) => (
                <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 8, borderTop: "1px solid var(--line)" }}>
                  <Avatar name={p.name ?? p.email} />
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink)" }}>
                      {p.name ?? "Participant"}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--ink-faint)" }}>
                      {p.email}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Quick Help Card */}
          <div className="res-card" style={{ background: "color-mix(in srgb, var(--blue-soft) 40%, var(--surface))", borderColor: "color-mix(in srgb, var(--blue) 25%, transparent)" }}>
            <h4 style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 700, color: "var(--blue-dark)", display: "flex", alignItems: "center", gap: 6 }}>
              <Info size={16} />
              <span>Reservation Lifecycle Help</span>
            </h4>
            <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: "var(--ink-soft)" }}>
              Click on any step in the <strong>Reservation Status Track</strong> above to open detailed audit logs, actor records, and department decisions.
            </p>
          </div>
        </div>
      </div>

      {/* Return Request Modal */}
      {isReturnModalOpen && (
        <div className="res-modal-backdrop" onClick={() => setIsReturnModalOpen(false)}>
          <div className="res-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="res-modal-header">
              <h4 style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <RotateCcw size={18} color="var(--blue)" />
                <span>Submit Return Request Slip</span>
              </h4>
              <button
                type="button"
                onClick={() => setIsReturnModalOpen(false)}
                style={{ background: "transparent", border: 0, cursor: "pointer", color: "var(--ink-faint)" }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleReturnSubmit}>
              <div className="res-modal-body">
                <p style={{ fontSize: 12, color: "var(--ink-soft)", margin: "0 0 14px" }}>
                  Specify the quantities of equipment you are physically dropping off at the equipment room:
                </p>

                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 14 }}>
                  {reservation.items.map((item) => {
                    const remaining = item.returnSummary?.remainingReturnQuantity ?? item.quantity;
                    if (remaining <= 0) return null;

                    return (
                      <div key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: "var(--surface-raised)", border: "1px solid var(--line)", borderRadius: 8, fontSize: 12 }}>
                        <div>
                          <span style={{ fontWeight: 700, color: "var(--ink)", display: "block" }}>{item.asset.name}</span>
                          <span style={{ fontSize: 11, color: "var(--ink-faint)" }}>Available to return: max {remaining}</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <label style={{ fontSize: 11, color: "var(--ink-faint)" }}>Qty:</label>
                          <input
                            type="number"
                            min={0}
                            max={remaining}
                            value={returnQuantities[item.id] ?? 0}
                            onChange={(e) => {
                              const val = Math.max(0, Math.min(remaining, parseInt(e.target.value) || 0));
                              setReturnQuantities((prev) => ({ ...prev, [item.id]: val }));
                            }}
                            className="control"
                            style={{ width: 70, height: 32, textAlign: "center", fontWeight: 700 }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--ink)", marginBottom: 6 }}>
                    Drop-off Location / Return Note:
                  </label>
                  <textarea
                    rows={2}
                    value={returnNote}
                    onChange={(e) => setReturnNote(e.target.value)}
                    placeholder="e.g. Placed back in Marketing Cabinet B"
                    className="control"
                    style={{ width: "100%", padding: "8px 12px", fontSize: 12, minHeight: 60 }}
                  />
                </div>
              </div>

              <div className="res-modal-footer">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setIsReturnModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={actionLoading}
                >
                  {actionLoading ? "Submitting..." : "Submit Return Slip"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

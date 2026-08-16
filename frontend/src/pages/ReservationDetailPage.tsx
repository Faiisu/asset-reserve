import {
  ArrowLeft,
  Calendar,
  Clock,
  MapPin,
  Package,
  User,
  CheckCircle2,
  AlertCircle,
  Truck,
  RotateCcw,
  XCircle,
  FileEdit,
  ShieldAlert,
  Download,
  Info,
} from "lucide-react";
import { useEffect, useState, useCallback } from "react";
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
  const { session, hasPermission, hasAreaPermission } = useAuth();

  const [reservation, setReservation] = useState<ReservationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

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
      // Initialize return quantities
      const initialQty: Record<string, number> = {};
      data.items.forEach((item) => {
        const remaining = item.returnSummary?.remainingReturnQuantity ?? item.quantity;
        initialQty[item.id] = remaining > 0 ? remaining : 0;
      });
      setReturnQuantities(initialQty);
    } catch (err: any) {
      setError(err.message ?? "Failed to load reservation details.");
    } finally {
      setLoading(false);
    }
  }, [reservationId]);

  useEffect(() => {
    loadReservation();
  }, [loadReservation]);

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
      <div className="reservation-detail-page p-8 max-w-6xl mx-auto">
        <LoadingState label="Loading reservation details..." />
      </div>
    );
  }

  if (error || !reservation) {
    return (
      <div className="reservation-detail-page p-8 max-w-6xl mx-auto">
        <ErrorState
          error={error ?? "Could not find the requested reservation."}
          onRetry={loadReservation}
        />
      </div>
    );
  }

  const isRequester = session?.user?.id === reservation.requester.id;
  const canConfirmDelivery = reservation.capabilities?.canConfirmDelivery;
  const canReturn = reservation.capabilities?.canReturn;
  const canCancel = reservation.capabilities?.canCancel;
  const canRequestChange = reservation.capabilities?.canRequestChange;

  return (
    <div className="reservation-detail-page p-6 max-w-6xl mx-auto space-y-6">
      {/* Top Breadcrumb / Navigation */}
      <div className="flex items-center justify-between">
        <Link
          to="/reservations"
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Reservations</span>
        </Link>
        <span className="text-xs font-mono text-slate-400">
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
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
                {reservation.eventName}
              </h1>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${
                reservation.status === "APPROVED" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" :
                reservation.status === "DELIVERY_CONFIRMED" ? "bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300" :
                reservation.status === "ACTIVE" ? "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300" :
                reservation.status === "COMPLETED" ? "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300" :
                reservation.status === "PENDING_APPROVAL" ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" :
                "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
              }`}>
                {reservationStatusLabel[reservation.status] ?? reservation.status}
              </span>
            </div>
            {reservation.description && (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {reservation.description}
              </p>
            )}
          </div>

          {/* Quick Primary Actions */}
          <div className="flex items-center gap-2">
            {canConfirmDelivery && (
              <Button
                variant="primary"
                onClick={handleConfirmDelivery}
                disabled={actionLoading}
                className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <Truck className="w-4 h-4" />
                <span>Confirm Delivery (Pickup)</span>
              </Button>
            )}

            {canReturn && (
              <Button
                variant="primary"
                onClick={() => setIsReturnModalOpen(true)}
                disabled={actionLoading}
                className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Return Gear</span>
              </Button>
            )}

            {canCancel && (
              <Button
                variant="danger"
                onClick={handleCancelReservation}
                disabled={actionLoading}
                className="gap-2"
              >
                <XCircle className="w-4 h-4" />
                <span>Cancel</span>
              </Button>
            )}
          </div>
        </div>

        {/* Key Info Meta Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-6 border-t border-slate-100 dark:border-slate-800 text-xs">
          <div className="flex items-center gap-2.5">
            <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
            <div>
              <span className="text-slate-400 block">Schedule Window</span>
              <span className="font-medium text-slate-700 dark:text-slate-200">
                {formatDate(reservation.startAt, true)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <Clock className="w-4 h-4 text-slate-400 shrink-0" />
            <div>
              <span className="text-slate-400 block">Duration</span>
              <span className="font-medium text-slate-700 dark:text-slate-200">
                {reservationDuration(reservation.startAt, reservation.endAt)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <User className="w-4 h-4 text-slate-400 shrink-0" />
            <div>
              <span className="text-slate-400 block">Requester</span>
              <span className="font-medium text-slate-700 dark:text-slate-200">
                {reservation.requester.name ?? reservation.requester.email}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <Package className="w-4 h-4 text-slate-400 shrink-0" />
            <div>
              <span className="text-slate-400 block">Equipment Count</span>
              <span className="font-medium text-slate-700 dark:text-slate-200">
                {reservation.items.length} lines ({reservation.items.reduce((acc, it) => acc + it.quantity, 0)} units)
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 🚀 HORIZONTAL INTERACTIVE TRACKING STEPPER WITH AUDIT LOGS */}
      <ReservationHorizontalTracker reservation={reservation} />

      {/* Main Two-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2/3): Equipment Manifest & History */}
        <div className="lg:col-span-2 space-y-6">
          {/* Equipment Manifest Card */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Package className="w-4 h-4 text-slate-500" />
                <span>Reserved Equipment Manifest</span>
              </h2>
              <span className="text-xs text-slate-500 font-mono">
                {reservation.items.length} items
              </span>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-100 dark:border-slate-800 rounded-xl overflow-hidden">
              {reservation.items.map((item) => (
                <div
                  key={item.id}
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/50 dark:hover:bg-slate-850/50 transition"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-500 font-bold text-xs shrink-0">
                      {item.asset.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                        {item.asset.name}
                      </h4>
                      <p className="text-xs text-slate-500">
                        Area: {item.asset.managementArea.name}
                      </p>
                      {item.approval?.comment && (
                        <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 bg-slate-50 dark:bg-slate-800 px-2 py-1 rounded">
                          Approver note: "{item.approval.comment}"
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex sm:flex-col items-end justify-between sm:justify-center gap-1 shrink-0">
                    <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                      Qty: {item.quantity} unit(s)
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                      item.status === "APPROVED" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" :
                      item.status === "DELIVERED" ? "bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300" :
                      item.status === "RETURNED" ? "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300" :
                      item.status === "REJECTED" ? "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300" :
                      "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                    }`}>
                      {item.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Return History Slips (If any) */}
          {reservation.returns.length > 0 && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
                <RotateCcw className="w-4 h-4 text-blue-500" />
                <span>Return & Inspection Slips</span>
              </h3>
              <div className="space-y-3">
                {reservation.returns.map((ret) => (
                  <div key={ret.id} className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200/60 dark:border-slate-800 text-xs">
                    <div className="flex items-center justify-between font-semibold">
                      <span>Slip ID: {ret.id.slice(0, 8)}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                        ret.status === "COMPLETED" || ret.status === "APPROVED" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" :
                        "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                      }`}>
                        {ret.status}
                      </span>
                    </div>
                    <p className="text-slate-500 mt-1">
                      Submitted at: {formatDate(ret.createdAt, true)}
                    </p>
                    {ret.approval?.description && (
                      <p className="text-slate-600 dark:text-slate-300 mt-2 bg-white dark:bg-slate-900 p-2 rounded border border-slate-200/50">
                        <strong>Inspector Remarks:</strong> {ret.approval.description}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Column (1/3): Participants & Timeline Meta */}
        <div className="space-y-6">
          {/* Participants Card */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
              <User className="w-4 h-4 text-slate-500" />
              <span>Event Team & Participants</span>
            </h3>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Avatar name={reservation.requester.name ?? reservation.requester.email} />
                <div>
                  <p className="text-xs font-bold text-slate-900 dark:text-slate-100">
                    {reservation.requester.name ?? "User"}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {reservation.requester.email} (Requester)
                  </p>
                </div>
              </div>

              {reservation.participants.map((p) => (
                <div key={p.id} className="flex items-center gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <Avatar name={p.name ?? p.email} />
                  <div>
                    <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                      {p.name ?? "Participant"}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {p.email}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Quick Help / Instructions Card */}
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-2xl p-5 shadow-sm text-xs space-y-3">
            <h4 className="font-bold flex items-center gap-1.5 text-amber-400">
              <Info className="w-4 h-4" />
              <span>Reservation Lifecycle Help</span>
            </h4>
            <p className="text-slate-300 leading-relaxed">
              คลิกที่แต่ละขั้นตอนใน <strong>Reservation Status Track</strong> ด้านบนเพื่อเปิดดูบันทึก Audit Logs และการตัดสินใจของแต่ละแผนกอย่างละเอียด
            </p>
            <div className="pt-2 border-t border-slate-700/60 text-[11px] text-slate-400">
              Created: {formatDate(reservation.createdAt, true)}
            </div>
          </div>
        </div>
      </div>

      {/* Return Request Modal */}
      {isReturnModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <RotateCcw className="w-5 h-5 text-blue-600" />
              <span>Submit Return Request Slip</span>
            </h3>
            <p className="text-xs text-slate-500">
              Specify the quantities of equipment you are physically dropping off at the equipment room:
            </p>

            <form onSubmit={handleReturnSubmit} className="space-y-4">
              <div className="space-y-3 max-h-[40vh] overflow-y-auto pr-1">
                {reservation.items.map((item) => {
                  const remaining = item.returnSummary?.remainingReturnQuantity ?? item.quantity;
                  if (remaining <= 0) return null;

                  return (
                    <div key={item.id} className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-between text-xs">
                      <div>
                        <span className="font-bold text-slate-800 dark:text-slate-200 block">{item.asset.name}</span>
                        <span className="text-slate-400">Available to return: max {remaining}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-slate-500 text-[11px]">Qty:</label>
                        <input
                          type="number"
                          min={0}
                          max={remaining}
                          value={returnQuantities[item.id] ?? 0}
                          onChange={(e) => {
                            const val = Math.max(0, Math.min(remaining, parseInt(e.target.value) || 0));
                            setReturnQuantities((prev) => ({ ...prev, [item.id]: val }));
                          }}
                          className="w-16 h-8 text-center font-bold bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-xs"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Drop-off Location / Return Note:
                </label>
                <textarea
                  rows={2}
                  value={returnNote}
                  onChange={(e) => setReturnNote(e.target.value)}
                  placeholder="e.g. Placed back in Marketing Cabinet B"
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
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
                  className="bg-blue-600 hover:bg-blue-700 text-white"
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

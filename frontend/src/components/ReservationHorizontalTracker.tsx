import * as React from "react";
import {
  CheckCircle2,
  Circle,
  Clock3,
  XCircle,
  FileText,
  ShieldCheck,
  PackageCheck,
  CalendarDays,
  RotateCcw,
  X,
} from "lucide-react";
import type { ReservationDetail } from "@/types";
import { formatDate } from "@/components/ui";

export interface StepLogItem {
  id: string;
  stepKey: "draft" | "approval" | "delivery" | "active" | "return";
  title: string;
  shortLabel: string;
  status: "completed" | "current" | "upcoming" | "rejected" | "cancelled";
  timestamp: string;
  summary: string;
  icon: React.ElementType;
  logs: {
    label: string;
    value: string | React.ReactNode;
    time?: string;
  }[];
  itemsOverview?: {
    assetName: string;
    quantity: number;
    areaName: string;
    itemStatus: string;
    approvalStatus?: string;
    approverName?: string;
    comment?: string | null;
  }[];
}

export function generateStepLogs(reservation: ReservationDetail): StepLogItem[] {
  const status = reservation.status;
  const createdAt = formatDate(reservation.createdAt, true);
  const updatedAt = formatDate(reservation.updatedAt, true);
  const startAtFormatted = formatDate(reservation.startAt, true);
  const endAtFormatted = formatDate(reservation.endAt, true);

  // 1. DRAFT STEP
  const draftStep: StepLogItem = {
    id: "step-draft",
    stepKey: "draft",
    title: "1. Drafted & Created",
    shortLabel: "Drafted",
    status: "completed",
    timestamp: createdAt,
    summary: `Created by ${reservation.requester.name ?? reservation.requester.email}`,
    icon: FileText,
    logs: [
      { label: "Event Name", value: reservation.eventName },
      { label: "Requester", value: `${reservation.requester.name ?? "User"} (${reservation.requester.email})` },
      { label: "Created Timestamp", value: createdAt },
      { label: "Description", value: reservation.description || "No description provided." },
      { label: "Initial Items Count", value: `${reservation.items.length} items (${reservation.items.reduce((s, i) => s + i.quantity, 0)} total units)` },
      { label: "Participants", value: reservation.participants.length > 0 ? reservation.participants.map(p => p.name ?? p.email).join(", ") : "None specified" },
    ],
  };

  // Check early cancellation or full rejection
  if (status === "CANCELLED") {
    return [
      draftStep,
      {
        id: "step-cancelled",
        stepKey: "approval",
        title: "Cancelled",
        shortLabel: "Cancelled",
        status: "cancelled",
        timestamp: updatedAt,
        summary: "Reservation was cancelled by requester or administrator",
        icon: XCircle,
        logs: [
          { label: "Cancellation Time", value: updatedAt },
          { label: "Reason", value: "Cancelled before completion or pickup" },
          { label: "Current Status", value: "CANCELLED" },
        ],
      },
    ];
  }

  if (status === "REJECTED") {
    return [
      draftStep,
      {
        id: "step-rejected",
        stepKey: "approval",
        title: "Request Rejected",
        shortLabel: "Rejected",
        status: "rejected",
        timestamp: updatedAt,
        summary: "All requested asset lines were rejected by Area Managers",
        icon: XCircle,
        logs: [
          { label: "Decision Time", value: updatedAt },
          { label: "Reason", value: "Rejected during area review" },
        ],
        itemsOverview: reservation.items.map((i) => ({
          assetName: i.asset.name,
          quantity: i.quantity,
          areaName: i.asset.managementArea.name,
          itemStatus: i.status,
          approvalStatus: i.approval?.status ?? "REJECTED",
          approverName: i.approval?.approver.name ?? i.approval?.approver.email ?? "Area Manager",
          comment: i.approval?.comment,
        })),
      },
    ];
  }

  // 2. APPROVAL STEP
  const isApprovedOrBeyond = [
    "APPROVED",
    "PARTIALLY_APPROVED",
    "DELIVERY_CONFIRMED",
    "ACTIVE",
    "RETURN",
    "RETURN_PENDING",
    "RETURN_CONFIRMED",
    "COMPLETED",
  ].includes(status);

  const approvalDecidedAt = reservation.items.find((i) => i.approval?.decidedAt)?.approval?.decidedAt;
  const approvedItemCount = reservation.items.filter((i) => i.approval?.status === "APPROVED").length;
  const totalItemCount = reservation.items.length;

  const approvalStep: StepLogItem = {
    id: "step-approval",
    stepKey: "approval",
    title: status === "PARTIALLY_APPROVED" ? "2. Partially Approved" : "2. Area Approvals",
    shortLabel: status === "PARTIALLY_APPROVED" ? "Partially Approved" : "Approved",
    status: isApprovedOrBeyond
      ? "completed"
      : status === "PENDING_APPROVAL"
        ? "current"
        : "upcoming",
    timestamp: isApprovedOrBeyond
      ? formatDate(approvalDecidedAt ?? reservation.updatedAt, true)
      : status === "PENDING_APPROVAL"
        ? "Pending Review"
        : "Awaiting Submission",
    summary: isApprovedOrBeyond
      ? `Approved (${approvedItemCount}/${totalItemCount} asset lines approved)`
      : "Area Managers reviewing requested equipment",
    icon: ShieldCheck,
    logs: [
      { label: "Approval Status", value: status === "PARTIALLY_APPROVED" ? "Partially Approved" : isApprovedOrBeyond ? "Approved" : "Pending Area Review" },
      { label: "Decision Timestamp", value: isApprovedOrBeyond ? formatDate(approvalDecidedAt ?? reservation.updatedAt, true) : "Pending" },
      { label: "Approved Lines", value: `${approvedItemCount} of ${totalItemCount} lines approved` },
    ],
    itemsOverview: reservation.items.map((i) => ({
      assetName: i.asset.name,
      quantity: i.quantity,
      areaName: i.asset.managementArea.name,
      itemStatus: i.status,
      approvalStatus: i.approval?.status ?? "PENDING",
      approverName: i.approval?.approver.name ?? i.approval?.approver.email ?? "Pending Manager",
      comment: i.approval?.comment,
    })),
  };

  // 3. DELIVERY / HANDOVER STEP
  const isDeliveredOrBeyond = [
    "DELIVERY_CONFIRMED",
    "ACTIVE",
    "RETURN",
    "RETURN_PENDING",
    "RETURN_CONFIRMED",
    "COMPLETED",
  ].includes(status);

  const deliveredAt = reservation.updatedAt;

  const deliveryStep: StepLogItem = {
    id: "step-delivery",
    stepKey: "delivery",
    title: "3. Equipment Handover",
    shortLabel: "Handover",
    status: isDeliveredOrBeyond
      ? "completed"
      : isApprovedOrBeyond
        ? "current"
        : "upcoming",
    timestamp: isDeliveredOrBeyond
      ? formatDate(deliveredAt, true)
      : isApprovedOrBeyond
        ? "Ready for pickup"
        : "Pending approval",
    summary: isDeliveredOrBeyond
      ? "Equipment received and verified by borrower"
      : isApprovedOrBeyond
        ? "Awaiting delivery confirmation / pickup"
        : "Pending area approval",
    icon: PackageCheck,
    logs: [
      { label: "Handover Status", value: isDeliveredOrBeyond ? "Handed over / Confirmed" : "Pending pickup" },
      { label: "Handover Timestamp", value: isDeliveredOrBeyond ? formatDate(deliveredAt, true) : "Not yet confirmed" },
      { label: "Recipient / Borrower", value: `${reservation.requester.name ?? "User"} (${reservation.requester.email})` },
      { label: "Delivered Items", value: `${reservation.items.filter(i => i.status === "DELIVERED" || i.status === "RETURNED").length} lines delivered` },
    ],
  };

  // 4. EVENT ACTIVE / IN-USE STEP
  const now = new Date();
  const startAt = new Date(reservation.startAt);
  const endAt = new Date(reservation.endAt);
  const isEventConcluded = now > endAt || ["RETURN", "RETURN_PENDING", "RETURN_CONFIRMED", "COMPLETED"].includes(status);
  const isCurrentlyInUse = isDeliveredOrBeyond && now >= startAt && now <= endAt;

  const activeStep: StepLogItem = {
    id: "step-active",
    stepKey: "active",
    title: "4. Event / In-Use Window",
    shortLabel: "In Use",
    status: isEventConcluded
      ? "completed"
      : isCurrentlyInUse
        ? "current"
        : "upcoming",
    timestamp: `${startAtFormatted} - ${endAtFormatted}`,
    summary: isCurrentlyInUse
      ? "Event is currently ongoing"
      : isEventConcluded
        ? "Event window concluded"
        : `Scheduled: ${startAtFormatted}`,
    icon: CalendarDays,
    logs: [
      { label: "Scheduled Start", value: startAtFormatted },
      { label: "Scheduled End", value: endAtFormatted },
      { label: "Active Status", value: isCurrentlyInUse ? "🟢 Currently Active In-Use" : isEventConcluded ? "Concluded" : "Upcoming Scheduled" },
      { label: "Event Name", value: reservation.eventName },
    ],
  };

  // 5. RETURN & INSPECTION STEP
  const latestReturn = reservation.returns[0];
  const isCompleted = status === "COMPLETED";
  const isReturnPending = ["RETURN", "RETURN_PENDING"].includes(status);

  const returnStep: StepLogItem = {
    id: "step-return",
    stepKey: "return",
    title: "5. Return & Inspection",
    shortLabel: "Returned",
    status: isCompleted
      ? "completed"
      : isReturnPending
        ? "current"
        : "upcoming",
    timestamp: isCompleted
      ? formatDate(latestReturn?.approval?.decidedAt ?? reservation.updatedAt, true)
      : isReturnPending
        ? "Pending Inspection"
        : "Pending Return",
    summary: isCompleted
      ? "All equipment returned, inspected, and restocked"
      : isReturnPending
        ? "Return slip submitted; awaiting manager inspection"
        : "Return equipment when event concludes",
    icon: RotateCcw,
    logs: [
      { label: "Return Status", value: isCompleted ? "Completed & Restocked" : isReturnPending ? "Awaiting Physical Inspection" : "Not yet returned" },
      { label: "Return Slips Filed", value: `${reservation.returns.length} return slip(s)` },
      ...(latestReturn
        ? [
            { label: "Latest Return Date", value: formatDate(latestReturn.createdAt, true) },
            { label: "Inspection Decision", value: latestReturn.approval?.status ?? "PENDING" },
            { label: "Inspector Notes", value: latestReturn.approval?.description || "No inspection remarks." },
          ]
        : []),
    ],
  };

  return [draftStep, approvalStep, deliveryStep, activeStep, returnStep];
}

export function ReservationHorizontalTracker({
  reservation,
  className,
}: {
  reservation: ReservationDetail;
  className?: string;
}) {
  const steps = React.useMemo(() => generateStepLogs(reservation), [reservation]);
  const [selectedStep, setSelectedStep] = React.useState<StepLogItem | null>(null);

  return (
    <div className={`res-horizontal-tracker ${className ?? ""}`}>
      <div className="res-tracker-header">
        <h3>
          <span>Reservation Status Track</span>
          <small>(Click any step to inspect audit logs)</small>
        </h3>
        <span className="res-detail-ref-id">
          ID: {reservation.id.slice(0, 8)}
        </span>
      </div>

      {/* Horizontal Steps Container */}
      <div className="res-tracker-steps">
        {steps.map((step) => {
          const isCompleted = step.status === "completed";
          const isCurrent = step.status === "current";
          const isCancelled = step.status === "cancelled" || step.status === "rejected";

          return (
            <button
              key={step.id}
              type="button"
              onClick={() => setSelectedStep(step)}
              className="res-step-btn"
            >
              {/* Step Node Icon */}
              <div
                className={`res-step-node ${
                  isCompleted ? "res-step-node--completed" :
                  isCurrent ? "res-step-node--current" :
                  isCancelled ? "res-step-node--cancelled" :
                  "res-step-node--upcoming"
                }`}
              >
                {isCompleted ? (
                  <CheckCircle2 size={20} />
                ) : isCurrent ? (
                  <Clock3 size={20} />
                ) : isCancelled ? (
                  <XCircle size={20} />
                ) : (
                  <Circle size={20} />
                )}
              </div>

              {/* Step Labels */}
              <div className="res-step-text">
                <span className="res-step-title">
                  {step.shortLabel}
                </span>
                <span className="res-step-time">
                  {step.timestamp}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Interactive Step Audit Log Drawer / Modal */}
      {selectedStep && (
        <div className="res-modal-backdrop" onClick={() => setSelectedStep(null)}>
          <div className="res-modal-card" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="res-modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div
                  className={`res-step-node ${
                    selectedStep.status === "completed" ? "res-step-node--completed" :
                    selectedStep.status === "current" ? "res-step-node--current" :
                    selectedStep.status === "upcoming" ? "res-step-node--upcoming" :
                    "res-step-node--cancelled"
                  }`}
                  style={{ width: 36, height: 36 }}
                >
                  <selectedStep.icon size={18} />
                </div>
                <div>
                  <h4>{selectedStep.title}</h4>
                  <p style={{ margin: 0, fontSize: 12, color: "var(--ink-soft)" }}>{selectedStep.summary}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedStep(null)}
                style={{ background: "transparent", border: 0, cursor: "pointer", color: "var(--ink-faint)" }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body: Audit Log Entries */}
            <div className="res-modal-body">
              <div style={{ marginBottom: 14 }}>
                <h5 style={{ margin: "0 0 8px", fontSize: 11, textTransform: "uppercase", color: "var(--ink-faint)", letterSpacing: "0.05em" }}>
                  Step Metadata & Timeline
                </h5>
                <div className="res-log-grid">
                  {selectedStep.logs.map((log, idx) => (
                    <div key={idx} className="res-log-row">
                      <span className="res-log-label">{log.label}:</span>
                      <span className="res-log-val">{log.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Items Breakdown (If applicable to approvals/returns) */}
              {selectedStep.itemsOverview && selectedStep.itemsOverview.length > 0 && (
                <div>
                  <h5 style={{ margin: "0 0 8px", fontSize: 11, textTransform: "uppercase", color: "var(--ink-faint)", letterSpacing: "0.05em" }}>
                    Line Items & Decisions
                  </h5>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {selectedStep.itemsOverview.map((item, idx) => (
                      <div key={idx} style={{ padding: "10px 14px", background: "var(--surface-raised)", border: "1px solid var(--line)", borderRadius: 8, fontSize: 12 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontWeight: 700, color: "var(--ink)" }}>
                          <span>{item.assetName} × {item.quantity}</span>
                          <span className={`res-status-badge ${
                            item.approvalStatus === "APPROVED" ? "res-status-badge--approved" :
                            item.approvalStatus === "REJECTED" ? "res-status-badge--rejected" :
                            "res-status-badge--pending_approval"
                          }`}>
                            {item.approvalStatus}
                          </span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", color: "var(--ink-faint)", fontSize: 11, marginTop: 4 }}>
                          <span>Area: {item.areaName}</span>
                          <span>Approver: {item.approverName}</span>
                        </div>
                        {item.comment && (
                          <div style={{ marginTop: 6, fontSize: 11, color: "var(--ink-soft)", background: "var(--surface)", padding: "4px 8px", borderRadius: 4, border: "1px solid var(--line)" }}>
                            💬 "{item.comment}"
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="res-modal-footer">
              <button
                type="button"
                onClick={() => setSelectedStep(null)}
                className="button button--secondary button--sm"
              >
                Close Log Inspector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

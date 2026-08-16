import * as React from "react";
import {
  CheckCircle2,
  Circle,
  Clock3,
  XCircle,
  AlertTriangle,
  FileText,
  ShieldCheck,
  PackageCheck,
  CalendarDays,
  RotateCcw,
  User,
  X,
  ExternalLink,
  ChevronRight,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
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
      ? formatDate(deliveredAt ?? reservation.updatedAt, true)
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
      { label: "Handover Timestamp", value: isDeliveredOrBeyond ? formatDate(deliveredAt ?? reservation.updatedAt, true) : "Not yet confirmed" },
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
    <div className={cn("horizontal-tracker bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm", className)}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <span>Reservation Status Track</span>
            <span className="text-xs font-normal text-slate-500">(คลิกที่แต่ละขั้นตอนเพื่อดู Log ละเอียด)</span>
          </h3>
        </div>
        <div className="text-xs text-slate-500 font-mono">
          ID: {reservation.id.slice(0, 8)}
        </div>
      </div>

      {/* Horizontal Steps Container */}
      <div className="relative flex items-center justify-between gap-2 overflow-x-auto py-2">
        {/* Background Connecting Line */}
        <div className="absolute top-[28px] left-[5%] right-[5%] h-[2px] bg-slate-200 dark:bg-slate-800 -z-0" />

        {steps.map((step, index) => {
          const isCompleted = step.status === "completed";
          const isCurrent = step.status === "current";
          const isCancelled = step.status === "cancelled" || step.status === "rejected";
          const isSelected = selectedStep?.id === step.id;

          return (
            <button
              key={step.id}
              type="button"
              onClick={() => setSelectedStep(step)}
              className={cn(
                "relative z-10 flex flex-col items-center min-w-[120px] flex-1 group transition-all p-2 rounded-xl border border-transparent hover:border-slate-200 dark:hover:border-slate-700 hover:bg-slate-50/80 dark:hover:bg-slate-800/60 focus:outline-none focus:ring-2 focus:ring-blue-500/20",
                isSelected && "border-blue-300 dark:border-blue-700 bg-blue-50/50 dark:bg-blue-950/30"
              )}
            >
              {/* Step Node Icon */}
              <div
                className={cn(
                  "w-11 h-11 rounded-full flex items-center justify-center transition-transform group-hover:scale-105 shadow-sm",
                  isCompleted && "bg-emerald-500 text-white shadow-emerald-500/20",
                  isCurrent && "bg-amber-500 text-white ring-4 ring-amber-100 dark:ring-amber-950 animate-pulse",
                  isCancelled && "bg-rose-500 text-white",
                  step.status === "upcoming" && "bg-slate-100 dark:bg-slate-800 text-slate-400 border border-slate-300 dark:border-slate-700"
                )}
              >
                {isCompleted ? (
                  <CheckCircle2 className="w-6 h-6" />
                ) : isCurrent ? (
                  <Clock3 className="w-6 h-6" />
                ) : isCancelled ? (
                  <XCircle className="w-6 h-6" />
                ) : (
                  <Circle className="w-6 h-6" />
                )}
              </div>

              {/* Step Labels */}
              <div className="mt-2.5 text-center">
                <span className={cn(
                  "text-xs font-semibold block",
                  isCompleted && "text-slate-900 dark:text-slate-100",
                  isCurrent && "text-amber-700 dark:text-amber-400 font-bold",
                  isCancelled && "text-rose-600 dark:text-rose-400",
                  step.status === "upcoming" && "text-slate-400"
                )}>
                  {step.shortLabel}
                </span>
                <span className="text-[11px] text-slate-500 block truncate max-w-[130px] mt-0.5 font-mono">
                  {step.timestamp}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Interactive Step Audit Log Drawer / Modal */}
      {selectedStep && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-xl w-full p-6 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-start justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "w-10 h-10 rounded-xl flex items-center justify-center text-white",
                  selectedStep.status === "completed" && "bg-emerald-500",
                  selectedStep.status === "current" && "bg-amber-500",
                  (selectedStep.status === "cancelled" || selectedStep.status === "rejected") && "bg-rose-500",
                  selectedStep.status === "upcoming" && "bg-slate-400"
                )}>
                  <selectedStep.icon className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    {selectedStep.title}
                  </h4>
                  <p className="text-xs text-slate-500">{selectedStep.summary}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedStep(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body: Audit Log Entries */}
            <div className="py-4 max-h-[60vh] overflow-y-auto space-y-4">
              <div className="space-y-2">
                <h5 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Step Metadata & Timeline</h5>
                <div className="grid grid-cols-1 gap-2 bg-slate-50 dark:bg-slate-800/50 p-3.5 rounded-xl border border-slate-100 dark:border-slate-800 text-xs">
                  {selectedStep.logs.map((log, idx) => (
                    <div key={idx} className="flex items-baseline justify-between gap-4 py-1 border-b border-slate-200/50 dark:border-slate-700/50 last:border-0">
                      <span className="font-medium text-slate-500 dark:text-slate-400 shrink-0">{log.label}:</span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200 text-right">{log.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Items Breakdown (If applicable to approvals/returns) */}
              {selectedStep.itemsOverview && selectedStep.itemsOverview.length > 0 && (
                <div className="space-y-2">
                  <h5 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Line Items & Decisions</h5>
                  <div className="space-y-2">
                    {selectedStep.itemsOverview.map((item, idx) => (
                      <div key={idx} className="p-3 bg-white dark:bg-slate-850 rounded-xl border border-slate-200 dark:border-slate-800 text-xs">
                        <div className="flex items-center justify-between font-semibold text-slate-900 dark:text-slate-100">
                          <span>{item.assetName} × {item.quantity}</span>
                          <span className={cn(
                            "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase",
                            item.approvalStatus === "APPROVED" && "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
                            item.approvalStatus === "REJECTED" && "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
                            item.approvalStatus === "PENDING" && "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                          )}>
                            {item.approvalStatus}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-slate-500 mt-1">
                          <span>Area: {item.areaName}</span>
                          <span>Approver: {item.approverName}</span>
                        </div>
                        {item.comment && (
                          <p className="mt-1 text-[11px] text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 p-1.5 rounded">
                            💬 "{item.comment}"
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedStep(null)}
                className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 dark:bg-slate-100 dark:text-slate-900 rounded-lg hover:bg-slate-800 transition"
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

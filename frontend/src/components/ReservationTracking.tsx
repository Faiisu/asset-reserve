import * as React from "react";
import { CheckCircle2, Circle, Clock, XCircle, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReservationDetail, ReservationStatus } from "@/types";
import { formatDate } from "@/components/ui";

export interface ReservationTimelineStep {
  name: string;
  timestamp: string;
  status: "completed" | "current" | "upcoming" | "rejected" | "cancelled";
  description?: string;
}

export function buildReservationSteps(reservation: ReservationDetail): ReservationTimelineStep[] {
  const steps: ReservationTimelineStep[] = [];
  const status = reservation.status;

  // Step 1: Creation / Draft
  steps.push({
    name: "Reservation Drafted",
    timestamp: formatDate(reservation.createdAt, true),
    status: "completed",
    description: `Created by ${reservation.requester.name ?? reservation.requester.email}`,
  });

  // Handle Cancelled / Rejected early branch
  if (status === "CANCELLED") {
    steps.push({
      name: "Reservation Cancelled",
      timestamp: formatDate(reservation.updatedAt, true),
      status: "cancelled",
      description: "Cancelled before completion",
    });
    return steps;
  }

  if (status === "REJECTED") {
    steps.push({
      name: "Request Rejected",
      timestamp: formatDate(reservation.updatedAt, true),
      status: "rejected",
      description: "Rejected by Area Managers",
    });
    return steps;
  }

  // Step 2: Submitted / Area Approval
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

  steps.push({
    name: status === "PARTIALLY_APPROVED" ? "Partially Approved" : "Area Approval",
    timestamp: isApprovedOrBeyond
      ? formatDate(approvalDecidedAt ?? reservation.updatedAt, true)
      : status === "PENDING_APPROVAL"
        ? "Pending manager review"
        : "Awaiting submission",
    status: isApprovedOrBeyond
      ? "completed"
      : status === "PENDING_APPROVAL"
        ? "current"
        : "upcoming",
    description: isApprovedOrBeyond
      ? "Approved by Area Custodians"
      : "Under review by Area Managers",
  });

  // Step 3: Equipment Handover / Delivery Confirm
  const isDeliveredOrBeyond = [
    "DELIVERY_CONFIRMED",
    "ACTIVE",
    "RETURN",
    "RETURN_PENDING",
    "RETURN_CONFIRMED",
    "COMPLETED",
  ].includes(status);

  const deliveredAt = reservation.items.find((i) => i.status === "DELIVERED" || i.status === "RETURNED")?.updatedAt;

  steps.push({
    name: "Equipment Handover",
    timestamp: isDeliveredOrBeyond
      ? formatDate(deliveredAt ?? reservation.updatedAt, true)
      : isApprovedOrBeyond
        ? "Ready for pickup / delivery"
        : "Pending approval",
    status: isDeliveredOrBeyond
      ? "completed"
      : isApprovedOrBeyond
        ? "current"
        : "upcoming",
    description: isDeliveredOrBeyond
      ? "Equipment received by borrower"
      : "Awaiting delivery confirmation",
  });

  // Step 4: Event Active / In-Use
  const now = new Date();
  const startAt = new Date(reservation.startAt);
  const endAt = new Date(reservation.endAt);
  const isEventConcluded = now > endAt || ["RETURN", "RETURN_PENDING", "RETURN_CONFIRMED", "COMPLETED"].includes(status);
  const isCurrentlyInUse = isDeliveredOrBeyond && now >= startAt && now <= endAt;

  steps.push({
    name: "Event / In-Use Window",
    timestamp: `${formatDate(reservation.startAt, true)} - ${formatDate(reservation.endAt, true)}`,
    status: isEventConcluded
      ? "completed"
      : isCurrentlyInUse
        ? "current"
        : "upcoming",
    description: isCurrentlyInUse ? "Active event ongoing" : "Scheduled reservation period",
  });

  // Step 5: Equipment Return & Physical Inspection
  const latestReturn = reservation.returns[0];
  const isCompleted = status === "COMPLETED";
  const isReturnPending = ["RETURN", "RETURN_PENDING"].includes(status);

  steps.push({
    name: "Return & Inspection",
    timestamp: isCompleted
      ? formatDate(latestReturn?.approval?.decidedAt ?? reservation.updatedAt, true)
      : isReturnPending
        ? "Return slip submitted, pending inspection"
        : "Pending event completion",
    status: isCompleted
      ? "completed"
      : isReturnPending
        ? "current"
        : "upcoming",
    description: isCompleted
      ? "All equipment returned & restocked"
      : isReturnPending
        ? "Manager physical inspection required"
        : "Return equipment when event concludes",
  });

  return steps;
}

export function ReservationTrackingTimeline({
  reservation,
  className,
}: {
  reservation: ReservationDetail;
  className?: string;
}) {
  const steps = React.useMemo(() => buildReservationSteps(reservation), [reservation]);

  return (
    <div className={cn("reservation-timeline w-full", className)}>
      <h3 className="reservation-timeline__title">Reservation Lifecycle Tracking</h3>
      <div className="reservation-timeline__list">
        {steps.map((step, index) => {
          const isCompleted = step.status === "completed";
          const isCurrent = step.status === "current";
          const isCancelled = step.status === "cancelled" || step.status === "rejected";

          return (
            <div key={index} className={cn("reservation-timeline__step flex", {
              "reservation-timeline__step--completed": isCompleted,
              "reservation-timeline__step--current": isCurrent,
              "reservation-timeline__step--upcoming": step.status === "upcoming",
              "reservation-timeline__step--cancelled": isCancelled,
            })}>
              <div className="flex flex-col items-center">
                {isCompleted ? (
                  <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-500" />
                ) : isCurrent ? (
                  <Clock className="h-6 w-6 shrink-0 text-amber-500 animate-pulse" />
                ) : isCancelled ? (
                  <XCircle className="h-6 w-6 shrink-0 text-rose-500" />
                ) : (
                  <Circle className="h-6 w-6 shrink-0 text-slate-300" />
                )}
                {index < steps.length - 1 && (
                  <div
                    className={cn("w-[2px] grow min-h-[32px] my-1", {
                      "bg-emerald-500": isCompleted && (steps[index + 1].status === "completed" || steps[index + 1].status === "current"),
                      "bg-slate-200": !isCompleted || steps[index + 1].status === "upcoming",
                    })}
                  />
                )}
              </div>
              <div className="ml-3.5 pb-5">
                <p className="text-sm font-semibold leading-none text-slate-900 flex items-center gap-2">
                  {step.name}
                  {isCurrent && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-800">
                      In Progress
                    </span>
                  )}
                </p>
                <p className="text-xs text-slate-500 mt-1 font-mono">{step.timestamp}</p>
                {step.description && (
                  <p className="text-xs text-slate-400 mt-0.5">{step.description}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

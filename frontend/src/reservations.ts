import type { ReservationItemStatus, ReservationStatus } from "./types";

export const reservationStatusLabel: Record<ReservationStatus, string> = {
  DRAFT: "Draft",
  PENDING_APPROVAL: "Pending approval",
  PARTIALLY_APPROVED: "Partially approved",
  APPROVED: "Approved",
  DELIVERY_CONFIRMED: "Delivery Confirmed",
  RETURN_PENDING: "Return Pending",
  COMPLETED: "Return Completed",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
};

export const reservationItemStatusLabel: Record<ReservationItemStatus, string> =
  {
    PENDING: "Pending",
    REJECTED: "Rejected",
    PREPARED: "Prepared",
    DELIVERED: "Delivered",
    RETURNED: "Returned",
  };

export function toLocalDateTime(value: string) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function defaultReservationWindow() {
  const now = new Date();
  now.setMinutes(0, 0, 0);
  const start = new Date(now.getTime() + 60 * 60_000);
  const end = new Date(start.getTime() + 2 * 60 * 60_000);
  return {
    startAt: toLocalDateTime(start.toISOString()),
    endAt: toLocalDateTime(end.toISOString()),
  };
}

export function reservationDuration(startAt: string, endAt: string) {
  const minutes = Math.max(
    0,
    Math.round(
      (new Date(endAt).getTime() - new Date(startAt).getTime()) / 60_000,
    ),
  );
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours} hr ${remainder} min` : `${hours} hr`;
}

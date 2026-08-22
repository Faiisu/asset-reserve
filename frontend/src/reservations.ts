import type { ReservationDetail, ReservationItemStatus, ReservationStatus } from "./types";

const RECENT_KEY = "asset-rail.recent-reservations";

export type RecentReservation = Pick<
  ReservationDetail,
  "id" | "eventName" | "startAt" | "status" | "updatedAt"
>;

export const reservationStatusLabel: Record<ReservationStatus, string> = {
  DRAFT: "Draft",
  PENDING_APPROVAL: "Pending approval",
  PARTIALLY_APPROVED: "Partially approved",
  APPROVED: "Approved",
  DELIVERY_CONFIRMED: "Delivery Confirmed",
  RETURN_PENDING: "Return Pending",
  RETURN_CONFIRMED: "Return Confirmed",
  COMPLETED: "Return Completed",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
};

export const reservationItemStatusLabel: Record<ReservationItemStatus, string> = {
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

export function rememberReservation(detail: ReservationDetail) {
  const item: RecentReservation = {
    id: detail.id,
    eventName: detail.eventName,
    startAt: detail.startAt,
    status: detail.status,
    updatedAt: detail.updatedAt,
  };
  const recent = readRecentReservations().filter(
    (value) => value.id !== item.id,
  );
  localStorage.setItem(
    RECENT_KEY,
    JSON.stringify([item, ...recent].slice(0, 6)),
  );
}

export function readRecentReservations(): RecentReservation[] {
  try {
    const value = JSON.parse(
      localStorage.getItem(RECENT_KEY) ?? "[]",
    ) as unknown;
    if (!Array.isArray(value)) return [];
    return value.filter(
      (item): item is RecentReservation =>
        typeof item === "object" &&
        item !== null &&
        "id" in item &&
        typeof item.id === "string" &&
        "eventName" in item &&
        typeof item.eventName === "string",
    );
  } catch {
    return [];
  }
}

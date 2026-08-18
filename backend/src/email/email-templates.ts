import type {
  ReservationDecidedEvent,
  ReservationSubmittedEvent,
  ReturnDecidedEvent,
} from "../common/reservation-lifecycle.events.js";

/**
 * Pure formatting functions -- no I/O, easy to unit test in isolation from
 * EmailService's actual sending. Each returns the subject + HTML body for
 * one notification.
 */

export type EmailContent = { subject: string; html: string };

const DATE_FORMAT_OPTS: Intl.DateTimeFormatOptions = {
  dateStyle: "medium",
  timeStyle: "short",
};

/** Single-date formatter, shared with the {{startAt}}/{{endAt}} placeholder
 * values an admin-customized template can use (email-templates.service.ts). */
export function formatEventDate(date: Date): string {
  return date.toLocaleString("en-US", DATE_FORMAT_OPTS);
}

function formatDateRange(startAt: Date, endAt: Date): string {
  return `${formatEventDate(startAt)} – ${formatEventDate(endAt)}`;
}

/** Exported so a customized template (email-templates/ module) gets the
 * same box/footer chrome a default one does -- reused, not duplicated. */
export function wrap(title: string, bodyHtml: string): string {
  return `
    <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 480px; margin: 0 auto; color: #16211c;">
      <h2 style="font-size: 18px; margin: 0 0 12px;">${title}</h2>
      ${bodyHtml}
      <p style="margin-top: 24px; font-size: 12px; color: #85958c;">
        Advantech Asset Reservation
      </p>
    </div>
  `.trim();
}

export function reservationSubmittedEmail(
  event: ReservationSubmittedEvent,
): EmailContent {
  const subject = `Reservation awaiting your decision: ${event.eventName}`;
  const html = wrap(
    "A reservation needs your decision",
    `
      <p><strong>${event.requester.name}</strong> submitted a reservation for
      "<strong>${event.eventName}</strong>" that needs approval in an area you manage.</p>
      <p>When: ${formatDateRange(event.startAt, event.endAt)}</p>
      <p>Sign in to review and approve or reject it.</p>
    `,
  );
  return { subject, html };
}

export function reservationDecidedEmail(
  event: ReservationDecidedEvent,
): EmailContent {
  const approved = event.decision === "APPROVE";
  const subject = approved
    ? `Reservation approved: ${event.eventName}`
    : `Reservation rejected: ${event.eventName}`;
  const html = wrap(
    approved
      ? "Your reservation was approved"
      : "Your reservation was rejected",
    `
      <p>Your reservation "<strong>${event.eventName}</strong>" ${
        approved
          ? "has been approved" +
            (event.status === "PARTIALLY_APPROVED"
              ? " in part -- some items are still pending or were rejected."
              : ".")
          : "was rejected."
      }</p>
      <p>When: ${formatDateRange(event.startAt, event.endAt)}</p>
      <p>Sign in for the full breakdown.</p>
    `,
  );
  return { subject, html };
}

/**
 * Maps each lifecycle event to the placeholder values an admin-customized
 * template (email-templates/ module) can reference as {{token}}. Kept next
 * to the hardcoded default templates above since both describe "what data
 * is available for this situation" -- only used when a saved override
 * exists; the hardcoded functions above remain the unconditional fallback
 * when it doesn't, so a deployment that never touches the new admin UI
 * behaves exactly as before.
 */
export function placeholdersForSubmitted(
  event: ReservationSubmittedEvent,
): Record<string, string> {
  return {
    eventName: event.eventName,
    requesterName: event.requester.name,
    startAt: formatEventDate(event.startAt),
    endAt: formatEventDate(event.endAt),
  };
}

export function placeholdersForDecided(
  event: ReservationDecidedEvent,
): Record<string, string> {
  return {
    eventName: event.eventName,
    startAt: formatEventDate(event.startAt),
    endAt: formatEventDate(event.endAt),
    decision: event.decision === "APPROVE" ? "approved" : "rejected",
    status: event.status.replace(/_/g, " ").toLowerCase(),
  };
}

export function placeholdersForReturnDecided(
  event: ReturnDecidedEvent,
): Record<string, string> {
  return {
    eventName: event.eventName,
    decision: event.decision === "APPROVED" ? "confirmed" : "rejected",
  };
}

export function returnDecidedEmail(event: ReturnDecidedEvent): EmailContent {
  const approved = event.decision === "APPROVED";
  const subject = approved
    ? `Return confirmed: ${event.eventName}`
    : `Return rejected: ${event.eventName}`;
  const html = wrap(
    approved ? "Your return was confirmed" : "Your return was rejected",
    `
      <p>The return you submitted for "<strong>${event.eventName}</strong>" was
      ${approved ? "confirmed." : "rejected. Contact your area manager for details."}</p>
      <p>Sign in for the full breakdown.</p>
    `,
  );
  return { subject, html };
}

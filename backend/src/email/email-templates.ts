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

function formatDateRange(startAt: Date, endAt: Date): string {
  const opts: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" };
  return `${startAt.toLocaleString("en-US", opts)} – ${endAt.toLocaleString("en-US", opts)}`;
}

function wrap(title: string, bodyHtml: string): string {
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

export function reservationSubmittedEmail(event: ReservationSubmittedEvent): EmailContent {
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

export function reservationDecidedEmail(event: ReservationDecidedEvent): EmailContent {
  const approved = event.decision === "APPROVE";
  const subject = approved
    ? `Reservation approved: ${event.eventName}`
    : `Reservation rejected: ${event.eventName}`;
  const html = wrap(
    approved ? "Your reservation was approved" : "Your reservation was rejected",
    `
      <p>Your reservation "<strong>${event.eventName}</strong>" ${
        approved
          ? "has been approved" +
            (event.status === "PARTIALLY_APPROVED" ? " in part -- some items are still pending or were rejected." : ".")
          : "was rejected."
      }</p>
      <p>When: ${formatDateRange(event.startAt, event.endAt)}</p>
      <p>Sign in for the full breakdown.</p>
    `,
  );
  return { subject, html };
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

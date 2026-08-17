import { Injectable } from "@nestjs/common";
import { EventEmitter } from "node:events";

// email is nullable: a user who hasn't linked Google yet has none on file
// yet. Callers that actually send mail (EmailService) must skip/guard on
// that; ReservationSubmittedEvent.requester below is display-only (it's
// never used as a send target) so a null email there is harmless.
type NotifyRecipient = { email: string | null; name: string };

export type ReservationSubmittedEvent = {
  reservationId: string;
  eventName: string;
  startAt: Date;
  endAt: Date;
  requester: NotifyRecipient;
  approverRecipients: NotifyRecipient[];
};

export type ReservationDecidedEvent = {
  reservationId: string;
  eventName: string;
  startAt: Date;
  endAt: Date;
  /** Reservation status *after* this decision was applied. */
  status: string;
  decision: "APPROVE" | "REJECT";
  requester: { id: string } & NotifyRecipient;
};

export type ReservationCancelledEvent = {
  reservationId: string;
  requesterId: string;
};

export type ReturnDecidedEvent = {
  reservationId: string;
  returnId: string;
  eventName: string;
  decision: "APPROVED" | "REJECTED";
  requester: NotifyRecipient;
};

/**
 * Minimal in-process pub/sub for reservation lifecycle changes, mirroring
 * AssetLifecycleEvents (backend/src/common/asset-lifecycle.events.ts) --
 * kept as its own bus rather than folded into that one since the two cover
 * unrelated domains (asset active/inactive vs. reservation/return
 * decisions) with different listeners. Lets EmailModule and
 * GoogleCalendarModule react to reservation/return state changes without
 * either of them importing ReservationsModule/ReturnsModule directly, and
 * without those modules needing to know email or calendar sync exist.
 *
 * Global module (see reservation-lifecycle.module.ts), so nothing beyond
 * AppModule needs to import it explicitly.
 */
@Injectable()
export class ReservationLifecycleEvents {
  private readonly emitter = new EventEmitter();

  onSubmitted(listener: (event: ReservationSubmittedEvent) => void): void {
    this.emitter.on("submitted", listener);
  }

  emitSubmitted(event: ReservationSubmittedEvent): void {
    this.emitter.emit("submitted", event);
  }

  onDecided(listener: (event: ReservationDecidedEvent) => void): void {
    this.emitter.on("decided", listener);
  }

  emitDecided(event: ReservationDecidedEvent): void {
    this.emitter.emit("decided", event);
  }

  onCancelled(listener: (event: ReservationCancelledEvent) => void): void {
    this.emitter.on("cancelled", listener);
  }

  emitCancelled(event: ReservationCancelledEvent): void {
    this.emitter.emit("cancelled", event);
  }

  onReturnDecided(listener: (event: ReturnDecidedEvent) => void): void {
    this.emitter.on("returnDecided", listener);
  }

  emitReturnDecided(event: ReturnDecidedEvent): void {
    this.emitter.emit("returnDecided", event);
  }
}

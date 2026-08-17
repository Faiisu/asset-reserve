import { Injectable, type OnModuleInit } from "@nestjs/common";
import { ReservationLifecycleEvents } from "../common/reservation-lifecycle.events.js";
import { EmailService } from "./email.service.js";

/**
 * Sends the three confirmed notification emails as a side effect of
 * reservation/return lifecycle events, mirroring
 * RecognitionLifecycleListener (backend/src/recognition/recognition-lifecycle.listener.ts):
 * subscribes in onModuleInit, calls the target method with `void`
 * (fire-and-forget) -- EmailService itself never throws, so a slow or
 * unreachable SMTP server can never block or fail the reservation/return
 * action that triggered the notification.
 */
@Injectable()
export class EmailLifecycleListener implements OnModuleInit {
  constructor(
    private readonly events: ReservationLifecycleEvents,
    private readonly email: EmailService,
  ) {}

  onModuleInit(): void {
    this.events.onSubmitted(
      (event) => void this.email.sendReservationSubmitted(event),
    );
    this.events.onDecided(
      (event) => void this.email.sendReservationDecided(event),
    );
    this.events.onReturnDecided(
      (event) => void this.email.sendReturnDecided(event),
    );
  }
}

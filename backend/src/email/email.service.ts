import { Injectable } from "@nestjs/common";
import nodemailer, { type Transporter } from "nodemailer";
import { appConfig } from "../config.js";
import type {
  ReservationDecidedEvent,
  ReservationSubmittedEvent,
  ReturnDecidedEvent,
} from "../common/reservation-lifecycle.events.js";
import {
  reservationDecidedEmail,
  reservationSubmittedEmail,
  returnDecidedEmail,
} from "./email-templates.js";

/**
 * Sends transactional email over Gmail SMTP (App Password auth). Never
 * throws past a public method -- every send is best-effort, matching
 * RecognitionService.setDisabled's "never blocks the primary action"
 * contract: a slow/unreachable SMTP server, or SMTP simply not being
 * configured (appConfig.smtp() returns null -- e.g. dev/CI), must never
 * fail or delay the reservation/return action that triggered the email.
 */
@Injectable()
export class EmailService {
  private readonly transporter: Transporter | null;
  private readonly from: string;

  constructor() {
    const smtp = appConfig.smtp();
    if (!smtp) {
      this.transporter = null;
      this.from = "";
      return;
    }
    this.transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.port === 465,
      auth: { user: smtp.user, pass: smtp.appPassword },
    });
    this.from = `"${smtp.fromName}" <${smtp.fromEmail}>`;
  }

  sendReservationSubmitted(event: ReservationSubmittedEvent): Promise<void> {
    const { subject, html } = reservationSubmittedEmail(event);
    return this.deliver(
      event.approverRecipients.map((r) => r.email),
      subject,
      html,
    );
  }

  sendReservationDecided(event: ReservationDecidedEvent): Promise<void> {
    const { subject, html } = reservationDecidedEmail(event);
    return this.deliver([event.requester.email], subject, html);
  }

  sendReturnDecided(event: ReturnDecidedEvent): Promise<void> {
    const { subject, html } = returnDecidedEmail(event);
    return this.deliver([event.requester.email], subject, html);
  }

  private async deliver(to: string[], subject: string, html: string): Promise<void> {
    if (to.length === 0) return;
    if (!this.transporter) {
      console.warn(`[email] SMTP not configured; skipped "${subject}" to ${to.join(", ")}`);
      return;
    }
    try {
      await this.transporter.sendMail({ from: this.from, to, subject, html });
    } catch (error) {
      console.warn(`[email] failed to send "${subject}" to ${to.join(", ")}:`, error);
    }
  }
}

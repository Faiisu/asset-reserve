import { Injectable } from "@nestjs/common";
import nodemailer from "nodemailer";
import { appConfig } from "../config.js";
import { decryptSecret } from "../common/secret-cipher.js";
import type {
  ReservationDecidedEvent,
  ReservationSubmittedEvent,
  ReturnDecidedEvent,
} from "../common/reservation-lifecycle.events.js";
import { PrismaService } from "../database/prisma.service.js";
import { NOTIFICATION_SETTINGS_ID } from "../notification-settings/notification-settings.constants.js";
import {
  reservationDecidedEmail,
  reservationSubmittedEmail,
  returnDecidedEmail,
} from "./email-templates.js";

type SmtpConfig = {
  host: string;
  port: number;
  user: string;
  appPassword: string;
  fromEmail: string;
  fromName: string;
};

/**
 * Sends transactional email over Gmail SMTP (App Password auth).
 *
 * The active SMTP config is resolved fresh on every send (resolveActiveSmtpConfig,
 * below) rather than cached from the constructor: an admin can change it at
 * any time through the Notification settings page, and this app's actual
 * volume (a handful of low-frequency triggers) makes the extra per-send DB
 * query + transporter construction negligible next to the correctness win
 * of never needing cache invalidation.
 *
 * The reservation/return trigger methods below are all best-effort and
 * never throw past a public method, matching RecognitionService.setDisabled's
 * "never blocks the primary action" contract: a slow/unreachable SMTP
 * server, or SMTP simply not being configured at all, must never fail or
 * delay the reservation/return action that triggered the email.
 * sendTestEmail() is the deliberate exception -- see its own comment.
 */
@Injectable()
export class EmailService {
  constructor(private readonly prisma: PrismaService) {}

  sendReservationSubmitted(event: ReservationSubmittedEvent): Promise<void> {
    const { subject, html } = reservationSubmittedEmail(event);
    // findApproverRecipients() already excludes approvers with no email on
    // file, but the shared NotifyRecipient type is nullable -- filter
    // defensively rather than relying on that invariant here too.
    return this.deliver(
      event.approverRecipients
        .map((r) => r.email)
        .filter((email): email is string => Boolean(email)),
      subject,
      html,
    );
  }

  sendReservationDecided(event: ReservationDecidedEvent): Promise<void> {
    const { subject, html } = reservationDecidedEmail(event);
    // The requester may not have linked Google yet (no email on file) --
    // deliver() already no-ops on an empty recipient list.
    return this.deliver(
      event.requester.email ? [event.requester.email] : [],
      subject,
      html,
    );
  }

  sendReturnDecided(event: ReturnDecidedEvent): Promise<void> {
    const { subject, html } = returnDecidedEmail(event);
    return this.deliver(
      event.requester.email ? [event.requester.email] : [],
      subject,
      html,
    );
  }

  /**
   * Sends a real test message to confirm the currently-saved settings
   * actually work. Deliberately NOT best-effort, unlike every other method
   * here -- the entire point of a "send test email" button is honest,
   * immediate feedback, so failures propagate to the caller instead of
   * being swallowed into a console.warn.
   */
  async sendTestEmail(to: string): Promise<void> {
    const smtp = await this.resolveActiveSmtpConfig();
    if (!smtp) {
      throw new Error("Email is not configured -- save your SMTP settings first.");
    }
    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.port === 465,
      auth: { user: smtp.user, pass: smtp.appPassword },
    });
    await transporter.sendMail({
      from: `"${smtp.fromName}" <${smtp.fromEmail}>`,
      to,
      subject: "Test email from Advantech Asset Reservation",
      html: "<p>Your notification settings are working -- this is a test message.</p>",
    });
  }

  private async deliver(to: string[], subject: string, html: string): Promise<void> {
    if (to.length === 0) return;
    const smtp = await this.resolveActiveSmtpConfig();
    if (!smtp) {
      console.warn(`[email] SMTP not configured; skipped "${subject}" to ${to.join(", ")}`);
      return;
    }
    try {
      const transporter = nodemailer.createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.port === 465,
        auth: { user: smtp.user, pass: smtp.appPassword },
      });
      await transporter.sendMail({
        from: `"${smtp.fromName}" <${smtp.fromEmail}>`,
        to,
        subject,
        html,
      });
    } catch (error) {
      console.warn(`[email] failed to send "${subject}" to ${to.join(", ")}:`, error);
    }
  }

  /**
   * Prefers the NotificationSettings database row (settable through the
   * admin UI, takes effect immediately) and falls back to SMTP_* env vars
   * (appConfig.smtp(), today's Phase-A behavior) when no row exists yet --
   * so deployments that never touch the new settings page keep working
   * unchanged. A decryption failure (e.g. TOKEN_ENCRYPTION_KEY missing or
   * changed) falls back to "unconfigured" rather than throwing -- same
   * "email must never break the triggering action" rule as everywhere else
   * in this class, sendTestEmail() aside.
   */
  private async resolveActiveSmtpConfig(): Promise<SmtpConfig | null> {
    const row = await this.prisma.notificationSettings.findUnique({
      where: { id: NOTIFICATION_SETTINGS_ID },
    });
    if (row) {
      try {
        return {
          host: row.smtpHost,
          port: row.smtpPort,
          user: row.smtpUser,
          appPassword: decryptSecret(row.smtpAppPasswordCipher),
          fromEmail: row.fromEmail,
          fromName: row.fromName,
        };
      } catch (error) {
        console.warn("[email] could not decrypt the saved App Password:", error);
        return null;
      }
    }
    return appConfig.smtp();
  }
}

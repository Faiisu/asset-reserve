import { afterEach, describe, expect, it, vi } from "vitest";
import {
  reservationDecidedEmail,
  reservationSubmittedEmail,
  returnDecidedEmail,
} from "../src/email/email-templates.js";
// EmailService reads appConfig.smtp() (which reads process.env) inside its
// constructor, not at module-load time, so vi.stubEnv() before
// `new EmailService()` in each test below is enough -- a plain static
// import works fine, no per-test re-import needed.
import { EmailService } from "../src/email/email.service.js";

const sendMail = vi.fn().mockResolvedValue({});
const createTransport = vi.fn().mockReturnValue({ sendMail });

vi.mock("nodemailer", () => ({
  default: { createTransport: (...args: unknown[]) => createTransport(...args) },
}));

const eventName = "Town Hall";
const startAt = new Date("2026-09-01T09:00:00.000Z");
const endAt = new Date("2026-09-01T11:00:00.000Z");

describe("email-templates", () => {
  it("reservationSubmittedEmail names the requester and event", () => {
    const { subject, html } = reservationSubmittedEmail({
      reservationId: "res-1",
      eventName,
      startAt,
      endAt,
      requester: { email: "req@example.com", name: "Reyna" },
      approverRecipients: [{ email: "mgr@example.com", name: "Manny" }],
    });
    expect(subject).toContain(eventName);
    expect(html).toContain("Reyna");
    expect(html).toContain(eventName);
  });

  it("reservationDecidedEmail differs for approve vs reject", () => {
    const base = {
      reservationId: "res-1",
      eventName,
      startAt,
      endAt,
      requester: { id: "u1", email: "req@example.com", name: "Reyna" },
    };
    const approved = reservationDecidedEmail({
      ...base,
      status: "APPROVED",
      decision: "APPROVE" as const,
    });
    const rejected = reservationDecidedEmail({
      ...base,
      status: "REJECTED",
      decision: "REJECT" as const,
    });
    expect(approved.subject).toMatch(/approved/i);
    expect(rejected.subject).toMatch(/rejected/i);
  });

  it("returnDecidedEmail differs for approved vs rejected", () => {
    const base = { reservationId: "res-1", returnId: "ret-1", eventName };
    const approved = returnDecidedEmail({
      ...base,
      decision: "APPROVED" as const,
      requester: { email: "req@example.com", name: "Reyna" },
    });
    const rejected = returnDecidedEmail({
      ...base,
      decision: "REJECTED" as const,
      requester: { email: "req@example.com", name: "Reyna" },
    });
    expect(approved.subject).toMatch(/confirmed/i);
    expect(rejected.subject).toMatch(/rejected/i);
  });
});

describe("EmailService", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("no-ops without throwing when SMTP is unconfigured", async () => {
    vi.stubEnv("SMTP_USER", "");
    vi.stubEnv("SMTP_APP_PASSWORD", "");
    const service = new EmailService();

    await expect(
      service.sendReservationDecided({
        reservationId: "res-1",
        eventName,
        startAt,
        endAt,
        status: "APPROVED",
        decision: "APPROVE",
        requester: { id: "u1", email: "req@example.com", name: "Reyna" },
      }),
    ).resolves.toBeUndefined();

    expect(createTransport).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("sends through the configured transporter when SMTP is set", async () => {
    vi.stubEnv("SMTP_USER", "notify@example.com");
    vi.stubEnv("SMTP_APP_PASSWORD", "app-password");
    const service = new EmailService();

    await service.sendReservationDecided({
      reservationId: "res-1",
      eventName,
      startAt,
      endAt,
      status: "APPROVED",
      decision: "APPROVE",
      requester: { id: "u1", email: "req@example.com", name: "Reyna" },
    });

    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "smtp.gmail.com",
        auth: { user: "notify@example.com", pass: "app-password" },
      }),
    );
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: ["req@example.com"] }),
    );
  });

  it("swallows a send failure instead of throwing", async () => {
    vi.stubEnv("SMTP_USER", "notify@example.com");
    vi.stubEnv("SMTP_APP_PASSWORD", "app-password");
    sendMail.mockRejectedValueOnce(new Error("SMTP down"));
    const service = new EmailService();

    await expect(
      service.sendReturnDecided({
        reservationId: "res-1",
        returnId: "ret-1",
        eventName,
        decision: "APPROVED",
        requester: { email: "req@example.com", name: "Reyna" },
      }),
    ).resolves.toBeUndefined();
  });

  it("skips sending (and never calls the transporter) when there are no recipients", async () => {
    vi.stubEnv("SMTP_USER", "notify@example.com");
    vi.stubEnv("SMTP_APP_PASSWORD", "app-password");
    const service = new EmailService();

    await service.sendReservationSubmitted({
      reservationId: "res-1",
      eventName,
      startAt,
      endAt,
      requester: { email: "req@example.com", name: "Reyna" },
      approverRecipients: [],
    });

    expect(sendMail).not.toHaveBeenCalled();
  });
});

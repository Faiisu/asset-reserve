import { afterEach, describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../src/database/prisma.service.js";
import type { EmailService } from "../src/email/email.service.js";
import { NotificationSettingsService } from "../src/notification-settings/notification-settings.service.js";
import { NOTIFICATION_SETTINGS_ID } from "../src/notification-settings/notification-settings.constants.js";

const encryptSecret = vi.fn((plaintext: string) => `cipher:${plaintext}`);
const decryptSecret = vi.fn();
vi.mock("../src/common/secret-cipher.js", () => ({
  encryptSecret: (plaintext: string) => encryptSecret(plaintext),
  decryptSecret: (cipherText: string) => decryptSecret(cipherText),
}));

const actorId = "00000000-0000-4000-8000-000000000001";
const actorEmail = "admin@example.com";

const baseDto = {
  smtpHost: "smtp.gmail.com",
  smtpPort: 465,
  smtpUser: "notify@example.com",
  fromEmail: "notify@example.com",
  fromName: "Asset Bot",
};

const existingRow = {
  id: NOTIFICATION_SETTINGS_ID,
  smtpHost: "smtp.gmail.com",
  smtpPort: 465,
  smtpUser: "notify@example.com",
  smtpAppPasswordCipher: "cipher:old-password",
  fromEmail: "notify@example.com",
  fromName: "Asset Bot",
  updatedBy: actorId,
  updatedAt: new Date("2026-08-17T00:00:00.000Z"),
};

function makeEmailService(overrides?: Partial<EmailService>): EmailService {
  return { sendTestEmail: vi.fn().mockResolvedValue(undefined), ...overrides } as unknown as EmailService;
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("NotificationSettingsService.get", () => {
  it("returns a default, unconfigured shape when no row exists yet", async () => {
    const findUnique = vi.fn().mockResolvedValue(null);
    const prisma = { notificationSettings: { findUnique } } as unknown as PrismaService;
    const service = new NotificationSettingsService(prisma, makeEmailService());

    const result = await service.get();

    expect(result).toMatchObject({ smtpPasswordSet: false, updatedAt: null });
    expect(decryptSecret).not.toHaveBeenCalled();
  });

  it("reports smtpPasswordSet: true without ever decrypting the password", async () => {
    const findUnique = vi.fn().mockResolvedValue(existingRow);
    const prisma = { notificationSettings: { findUnique } } as unknown as PrismaService;
    const service = new NotificationSettingsService(prisma, makeEmailService());

    const result = await service.get();

    expect(result.smtpPasswordSet).toBe(true);
    expect(result).not.toHaveProperty("smtpPassword");
    expect(result).not.toHaveProperty("smtpAppPasswordCipher");
    expect(decryptSecret).not.toHaveBeenCalled();
  });
});

describe("NotificationSettingsService.update", () => {
  it("rejects the first-ever save if no App Password is provided", async () => {
    const findUnique = vi.fn().mockResolvedValue(null);
    const prisma = { notificationSettings: { findUnique } } as unknown as PrismaService;
    const service = new NotificationSettingsService(prisma, makeEmailService());

    await expect(service.update(actorId, baseDto)).rejects.toThrow(
      /App Password is required/,
    );
    expect(encryptSecret).not.toHaveBeenCalled();
  });

  it("encrypts and saves a new App Password on first save", async () => {
    const findUnique = vi.fn().mockResolvedValue(null);
    const upsert = vi.fn().mockResolvedValue({});
    const prisma = {
      notificationSettings: { findUnique, upsert },
    } as unknown as PrismaService;
    const service = new NotificationSettingsService(prisma, makeEmailService());

    await service.update(actorId, { ...baseDto, smtpPassword: "new-password" });

    expect(encryptSecret).toHaveBeenCalledWith("new-password");
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: NOTIFICATION_SETTINGS_ID },
        create: expect.objectContaining({
          smtpAppPasswordCipher: "cipher:new-password",
          updatedBy: actorId,
        }),
      }),
    );
  });

  it("keeps the existing cipher untouched when smtpPassword is omitted", async () => {
    const findUnique = vi.fn().mockResolvedValue(existingRow);
    const upsert = vi.fn().mockResolvedValue({});
    const prisma = {
      notificationSettings: { findUnique, upsert },
    } as unknown as PrismaService;
    const service = new NotificationSettingsService(prisma, makeEmailService());

    await service.update(actorId, { ...baseDto, fromName: "Renamed Bot" });

    expect(encryptSecret).not.toHaveBeenCalled();
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          smtpAppPasswordCipher: existingRow.smtpAppPasswordCipher,
          fromName: "Renamed Bot",
        }),
      }),
    );
  });

  it("replaces the cipher when a new smtpPassword is provided on an existing row", async () => {
    const findUnique = vi.fn().mockResolvedValue(existingRow);
    const upsert = vi.fn().mockResolvedValue({});
    const prisma = {
      notificationSettings: { findUnique, upsert },
    } as unknown as PrismaService;
    const service = new NotificationSettingsService(prisma, makeEmailService());

    await service.update(actorId, { ...baseDto, smtpPassword: "rotated-password" });

    expect(encryptSecret).toHaveBeenCalledWith("rotated-password");
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          smtpAppPasswordCipher: "cipher:rotated-password",
        }),
      }),
    );
  });
});

describe("NotificationSettingsService.sendTest", () => {
  it("delegates to EmailService.sendTestEmail with the actor's own email", async () => {
    const sendTestEmail = vi.fn().mockResolvedValue(undefined);
    const prisma = {} as unknown as PrismaService;
    const service = new NotificationSettingsService(prisma, makeEmailService({ sendTestEmail }));

    await service.sendTest(actorEmail);

    expect(sendTestEmail).toHaveBeenCalledWith(actorEmail);
  });

  it("wraps a send failure into a clean ApiException instead of leaking the raw error", async () => {
    const sendTestEmail = vi.fn().mockRejectedValue(new Error("Invalid login"));
    const prisma = {} as unknown as PrismaService;
    const service = new NotificationSettingsService(prisma, makeEmailService({ sendTestEmail }));

    await expect(service.sendTest(actorEmail)).rejects.toThrow("Invalid login");
  });
});

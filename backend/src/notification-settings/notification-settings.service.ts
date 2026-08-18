import { Injectable } from "@nestjs/common";
import { encryptSecret } from "../common/secret-cipher.js";
import { PrismaService } from "../database/prisma.service.js";
import { EmailService } from "../email/email.service.js";
import { ApiException } from "../common/api-exception.js";
import { NOTIFICATION_SETTINGS_ID } from "./notification-settings.constants.js";
import type { UpdateNotificationSettingsDto } from "./notification-settings.dto.js";

@Injectable()
export class NotificationSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
  ) {}

  /**
   * Never decrypts the App Password just to answer "is one saved" --
   * smtpPasswordSet is purely "is the cipher column non-null." The actual
   * secret only ever gets decrypted by EmailService, right before sending.
   */
  async get() {
    const row = await this.prisma.notificationSettings.findUnique({
      where: { id: NOTIFICATION_SETTINGS_ID },
    });
    if (!row) {
      return {
        smtpHost: "",
        smtpPort: 465,
        smtpUser: "",
        fromEmail: "",
        fromName: "",
        smtpPasswordSet: false,
        updatedAt: null as string | null,
      };
    }
    return {
      smtpHost: row.smtpHost,
      smtpPort: row.smtpPort,
      smtpUser: row.smtpUser,
      fromEmail: row.fromEmail,
      fromName: row.fromName,
      smtpPasswordSet: true,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async update(actorUserId: string, dto: UpdateNotificationSettingsDto) {
    const existing = await this.prisma.notificationSettings.findUnique({
      where: { id: NOTIFICATION_SETTINGS_ID },
    });
    if (!existing && !dto.smtpPassword) {
      throw new ApiException(
        422,
        "VALIDATION_ERROR",
        "An App Password is required the first time you save notification settings.",
        { smtpPassword: "App Password is required." },
      );
    }
    let smtpAppPasswordCipher: string;
    if (dto.smtpPassword) {
      try {
        smtpAppPasswordCipher = encryptSecret(dto.smtpPassword);
      } catch {
        throw new ApiException(
          503,
          "ENCRYPTION_NOT_CONFIGURED",
          "The server is not set up to store this securely yet (TOKEN_ENCRYPTION_KEY is missing). Contact your system administrator.",
        );
      }
    } else {
      smtpAppPasswordCipher = existing!.smtpAppPasswordCipher;
    }

    await this.prisma.notificationSettings.upsert({
      where: { id: NOTIFICATION_SETTINGS_ID },
      create: {
        id: NOTIFICATION_SETTINGS_ID,
        smtpHost: dto.smtpHost,
        smtpPort: dto.smtpPort,
        smtpUser: dto.smtpUser,
        smtpAppPasswordCipher,
        fromEmail: dto.fromEmail,
        fromName: dto.fromName,
        updatedBy: actorUserId,
      },
      update: {
        smtpHost: dto.smtpHost,
        smtpPort: dto.smtpPort,
        smtpUser: dto.smtpUser,
        smtpAppPasswordCipher,
        fromEmail: dto.fromEmail,
        fromName: dto.fromName,
        updatedBy: actorUserId,
        updatedAt: new Date(),
      },
    });
    return this.get();
  }

  async sendTest(actorEmail: string | null): Promise<void> {
    if (!actorEmail) {
      throw new ApiException(
        422,
        "NO_EMAIL_ON_FILE",
        "Set your notification email (in My account) before sending a test email -- there is no address to send it to yet.",
      );
    }
    try {
      await this.email.sendTestEmail(actorEmail);
    } catch (error) {
      throw new ApiException(
        502,
        "TEST_EMAIL_FAILED",
        error instanceof Error
          ? error.message
          : "Could not send the test email.",
      );
    }
  }
}

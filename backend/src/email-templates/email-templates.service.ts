import { Injectable } from "@nestjs/common";
import { ApiException } from "../common/api-exception.js";
import { PrismaService } from "../database/prisma.service.js";
import { renderTemplateBody, renderTemplateSubject } from "./template-markup.js";
import {
  EMAIL_TEMPLATE_META,
  EMAIL_TEMPLATE_SAMPLE_VALUES,
  EMAIL_TEMPLATE_SITUATIONS,
  isEmailTemplateSituation,
  type EmailTemplateSituation,
} from "./email-templates.constants.js";
import type {
  PreviewEmailTemplateDto,
  UpdateEmailTemplateDto,
} from "./email-templates.dto.js";

@Injectable()
export class EmailTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const rows = await this.prisma.emailTemplate.findMany();
    const bySituation = new Map(rows.map((row) => [row.situation, row]));
    return EMAIL_TEMPLATE_SITUATIONS.map((situation) =>
      this.toResponse(situation, bySituation.get(situation)),
    );
  }

  private toResponse(
    situation: EmailTemplateSituation,
    row:
      | {
          subject: string;
          bodyMarkdown: string;
          updatedBy: string | null;
          updatedAt: Date;
        }
      | undefined,
  ) {
    const meta = EMAIL_TEMPLATE_META[situation];
    return {
      situation,
      label: meta.label,
      description: meta.description,
      recipient: meta.recipient,
      placeholders: meta.placeholders,
      subject: row?.subject ?? meta.defaultSubject,
      bodyMarkdown: row?.bodyMarkdown ?? meta.defaultBodyMarkdown,
      isCustomized: Boolean(row),
      updatedBy: row?.updatedBy ?? null,
      updatedAt: row?.updatedAt.toISOString() ?? null,
    };
  }

  async get(situation: string) {
    this.assertKnown(situation);
    const row = await this.prisma.emailTemplate.findUnique({ where: { situation } });
    return this.toResponse(situation, row ?? undefined);
  }

  async update(actorUserId: string, situation: string, dto: UpdateEmailTemplateDto) {
    this.assertKnown(situation);
    await this.prisma.emailTemplate.upsert({
      where: { situation },
      create: {
        situation,
        subject: dto.subject,
        bodyMarkdown: dto.bodyMarkdown,
        updatedBy: actorUserId,
      },
      update: {
        subject: dto.subject,
        bodyMarkdown: dto.bodyMarkdown,
        updatedBy: actorUserId,
        updatedAt: new Date(),
      },
    });
    return this.get(situation);
  }

  async resetToDefault(situation: string) {
    this.assertKnown(situation);
    // No-op (not an error) if there was nothing customized to begin with --
    // "reset" should always leave the situation in the default state,
    // regardless of whether it started there.
    await this.prisma.emailTemplate
      .delete({ where: { situation } })
      .catch((error) => {
        if (this.prismaCode(error) !== "P2025") throw error;
      });
    return this.get(situation);
  }

  preview(situation: string, dto: PreviewEmailTemplateDto) {
    this.assertKnown(situation);
    return {
      subject: renderTemplateSubject(dto.subject, EMAIL_TEMPLATE_SAMPLE_VALUES),
      html: renderTemplateBody(dto.bodyMarkdown, EMAIL_TEMPLATE_SAMPLE_VALUES),
    };
  }

  private assertKnown(situation: string): asserts situation is EmailTemplateSituation {
    if (!isEmailTemplateSituation(situation)) {
      throw new ApiException(
        404,
        "EMAIL_TEMPLATE_NOT_FOUND",
        "Unknown email template situation.",
      );
    }
  }

  private prismaCode(error: unknown): string | undefined {
    return typeof error === "object" && error !== null && "code" in error
      ? String((error as { code: unknown }).code)
      : undefined;
  }
}

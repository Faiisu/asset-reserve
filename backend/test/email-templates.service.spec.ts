import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../src/database/prisma.service.js";
import { EmailTemplatesService } from "../src/email-templates/email-templates.service.js";
import { EMAIL_TEMPLATE_META } from "../src/email-templates/email-templates.constants.js";

const actorId = "00000000-0000-4000-8000-000000000001";

const savedRow = {
  situation: "reservation_submitted",
  subject: "Custom subject for {{eventName}}",
  bodyMarkdown: "Custom **body**.",
  updatedBy: actorId,
  createdAt: new Date("2026-08-17T00:00:00.000Z"),
  updatedAt: new Date("2026-08-17T01:00:00.000Z"),
};

describe("EmailTemplatesService.list", () => {
  it("returns all known situations, falling back to defaults for ones with no saved row", async () => {
    const findMany = vi.fn().mockResolvedValue([savedRow]);
    const prisma = { emailTemplate: { findMany } } as unknown as PrismaService;
    const service = new EmailTemplatesService(prisma);

    const result = await service.list();

    expect(result).toHaveLength(3);
    const submitted = result.find((r) => r.situation === "reservation_submitted")!;
    expect(submitted.isCustomized).toBe(true);
    expect(submitted.subject).toBe(savedRow.subject);
    const decided = result.find((r) => r.situation === "reservation_decided")!;
    expect(decided.isCustomized).toBe(false);
    expect(decided.subject).toBe(EMAIL_TEMPLATE_META.reservation_decided.defaultSubject);
  });
});

describe("EmailTemplatesService.get", () => {
  it("404s on an unknown situation", async () => {
    const prisma = {} as unknown as PrismaService;
    const service = new EmailTemplatesService(prisma);

    await expect(service.get("not-a-real-situation")).rejects.toMatchObject({
      code: "EMAIL_TEMPLATE_NOT_FOUND",
    });
  });
});

describe("EmailTemplatesService.update", () => {
  it("upserts, overwriting any previously-saved content for that situation", async () => {
    const upsert = vi.fn().mockResolvedValue(undefined);
    const findUnique = vi.fn().mockResolvedValue({
      ...savedRow,
      subject: "New subject",
      bodyMarkdown: "New body",
    });
    const prisma = {
      emailTemplate: { upsert, findUnique },
    } as unknown as PrismaService;
    const service = new EmailTemplatesService(prisma);

    const result = await service.update(actorId, "reservation_submitted", {
      subject: "New subject",
      bodyMarkdown: "New body",
    });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { situation: "reservation_submitted" },
        create: expect.objectContaining({ subject: "New subject", updatedBy: actorId }),
        update: expect.objectContaining({ subject: "New subject", updatedBy: actorId }),
      }),
    );
    expect(result.subject).toBe("New subject");
  });
});

describe("EmailTemplatesService.resetToDefault", () => {
  it("deletes the saved row, reverting to the default", async () => {
    const del = vi.fn().mockResolvedValue(undefined);
    const findUnique = vi.fn().mockResolvedValue(null);
    const prisma = { emailTemplate: { delete: del, findUnique } } as unknown as PrismaService;
    const service = new EmailTemplatesService(prisma);

    const result = await service.resetToDefault("reservation_submitted");

    expect(del).toHaveBeenCalledWith({ where: { situation: "reservation_submitted" } });
    expect(result.isCustomized).toBe(false);
  });

  it("is a no-op, not an error, when there was nothing to reset", async () => {
    const del = vi.fn().mockRejectedValue({ code: "P2025" });
    const findUnique = vi.fn().mockResolvedValue(null);
    const prisma = { emailTemplate: { delete: del, findUnique } } as unknown as PrismaService;
    const service = new EmailTemplatesService(prisma);

    await expect(service.resetToDefault("reservation_submitted")).resolves.toMatchObject({
      isCustomized: false,
    });
  });
});

describe("EmailTemplatesService.preview", () => {
  it("renders the given draft against sample placeholder values without persisting anything", () => {
    const prisma = {} as unknown as PrismaService;
    const service = new EmailTemplatesService(prisma);

    const result = service.preview("reservation_submitted", {
      subject: "Re: {{eventName}}",
      bodyMarkdown: "Hi **{{requesterName}}**",
    });

    expect(result.subject).toContain("Marketing Town Hall");
    expect(result.html).toContain("<strong>Jamie Rivera</strong>");
  });

  it("404s on an unknown situation", () => {
    const prisma = {} as unknown as PrismaService;
    const service = new EmailTemplatesService(prisma);

    expect(() =>
      service.preview("not-a-real-situation", { subject: "x", bodyMarkdown: "y" }),
    ).toThrowError(expect.objectContaining({ code: "EMAIL_TEMPLATE_NOT_FOUND" }));
  });
});

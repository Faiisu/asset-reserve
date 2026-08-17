import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { describe, expect, it } from "vitest";
import { MicrosoftCallbackQueryDto } from "../src/microsoft-auth/microsoft-auth.dto.js";

// Mirrors google-auth.dto.spec.ts's reasoning: the global ValidationPipe
// (main.ts) is whitelist + forbidNonWhitelisted, so a real Microsoft
// callback redirect's extra query params (session_state, in particular)
// must be explicitly declared here or every real callback 422s.
describe("MicrosoftCallbackQueryDto", () => {
  it("accepts a real Microsoft callback query string without validation errors", async () => {
    const instance = plainToInstance(MicrosoftCallbackQueryDto, {
      code: "M.C123_BAY.2.U.abcdef",
      state: "signed-state-token",
      session_state: "00000000-0000-0000-0000-000000000000",
    });
    const errors = await validate(instance, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    expect(errors).toEqual([]);
  });

  it("accepts the error + error_description shape Microsoft sends on consent denial", async () => {
    const instance = plainToInstance(MicrosoftCallbackQueryDto, {
      error: "access_denied",
      error_description: "The user declined to consent to access the app.",
      state: "signed-state-token",
    });
    const errors = await validate(instance, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    expect(errors).toEqual([]);
  });

  it("still rejects genuinely unexpected properties", async () => {
    const instance = plainToInstance(MicrosoftCallbackQueryDto, {
      code: "M.C123_BAY.2.U.abcdef",
      unexpected: "should not be allowed",
    });
    const errors = await validate(instance, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    expect(errors.some((e) => e.property === "unexpected")).toBe(true);
  });
});

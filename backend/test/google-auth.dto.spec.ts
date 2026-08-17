import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { describe, expect, it } from "vitest";
import { GoogleCallbackQueryDto } from "../src/google-auth/google-auth.dto.js";

// Mirrors the global ValidationPipe's options (main.ts): whitelist +
// forbidNonWhitelisted turn any undeclared property into a 422. Google's
// real callback redirect includes more than just code/state/error -- this
// test guards against silently dropping one of those again (regression:
// a first version of this DTO 422'd on a real Google callback because
// scope/authuser/prompt/iss weren't declared).
describe("GoogleCallbackQueryDto", () => {
  it("accepts a real Google callback query string without validation errors", async () => {
    const instance = plainToInstance(GoogleCallbackQueryDto, {
      code: "4/0Adeu5B...",
      scope: "email profile openid https://www.googleapis.com/auth/userinfo.email",
      authuser: "0",
      prompt: "consent",
      state: "signed-state-token",
      iss: "https://accounts.google.com",
      hd: "example.com",
    });
    const errors = await validate(instance, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    expect(errors).toEqual([]);
  });

  it("still rejects genuinely unexpected properties", async () => {
    const instance = plainToInstance(GoogleCallbackQueryDto, {
      code: "4/0Adeu5B...",
      unexpected: "should not be allowed",
    });
    const errors = await validate(instance, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    expect(errors.some((e) => e.property === "unexpected")).toBe(true);
  });
});

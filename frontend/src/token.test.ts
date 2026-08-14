import { describe, expect, it } from "vitest";
import { decodeTokenClaims, formatDuration, secondsUntilExpiry } from "./token";

function token(payload: object): string {
  const encoded = btoa(JSON.stringify(payload))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `header.${encoded}.signature`;
}

describe("token helpers", () => {
  it("decodes display-only JWT claims", () => {
    expect(
      decodeTokenClaims(
        token({ sub: "user-1", iat: 100, exp: 1000, jti: "token-1" }),
      ),
    ).toEqual({
      sub: "user-1",
      iat: 100,
      exp: 1000,
      jti: "token-1",
    });
  });

  it("does not return negative time for expired tokens", () => {
    expect(secondsUntilExpiry({ exp: 100 }, 101_000)).toBe(0);
  });

  it("formats token lifetime as a stable clock", () => {
    expect(formatDuration(125)).toBe("02:05");
    expect(formatDuration(null)).toBe("ไม่ทราบเวลา");
  });
});

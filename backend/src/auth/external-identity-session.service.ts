import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { randomUUID } from "node:crypto";
import { appConfig } from "../config.js";
import { SessionService } from "./session.service.js";
import type { ExternalState } from "./external-identity.js";

/**
 * The state-signing and session-issuing logic every external identity
 * provider needs is identical (not provider-specific) -- extracted here
 * once instead of duplicated in google-auth.service.ts and
 * microsoft-auth.service.ts. Registered in AuthModule (needs
 * SessionService + JwtService, both already provided there) and exported
 * alongside them so GoogleAuthModule/MicrosoftAuthModule (both
 * `imports: [AuthModule]`) can inject it directly.
 */
@Injectable()
export class ExternalIdentitySessionService {
  constructor(
    private readonly jwt: JwtService,
    private readonly sessions: SessionService,
  ) {}

  // Signed separately from the access token, short 10-minute TTL. This is
  // how a provider's one /callback route tells "connect" and "login"
  // apart, and ties a "connect" attempt back to the user who started it --
  // signed so the client can't tamper with either.
  signState(payload: ExternalState): Promise<string> {
    return this.jwt.signAsync(payload, { expiresIn: "10m" });
  }

  verifyState(token: string): Promise<ExternalState> {
    return this.jwt.verifyAsync<ExternalState>(token);
  }

  /**
   * Issues a session exactly like AuthService.login() does, for a user
   * already known to exist (by id, not credentials) -- used by a
   * provider's "login" purpose once an already-linked identity is found.
   * Returns null if the user is missing/inactive.
   */
  async issueSession(userId: string) {
    const session = await this.sessions.getActor(userId);
    if (!session) return null;
    const accessToken = await this.jwt.signAsync({ sub: userId, jti: randomUUID() });
    return {
      accessToken,
      tokenType: "Bearer" as const,
      expiresIn: appConfig.jwtAccessTtlSeconds,
      session,
    };
  }
}

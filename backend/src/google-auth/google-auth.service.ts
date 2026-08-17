import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { randomUUID } from "node:crypto";
import { appConfig } from "../config.js";
import { SessionService } from "../auth/session.service.js";
import { createOAuth2Client } from "./google-oauth-client.js";

export type GoogleConnectState = { purpose: "connect"; userId: string };
export type GoogleLoginState = { purpose: "login" };
export type GoogleState = GoogleConnectState | GoogleLoginState;

export type GoogleIdentity = {
  sub: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
  picture: string | null;
};

/**
 * OAuth mechanics + state signing for Google sign-in/account-linking.
 * Reuses AuthModule's JwtService (via GoogleAuthModule importing
 * AuthModule) so state tokens are verifiable/forgeable only by this
 * backend, same as access tokens.
 */
@Injectable()
export class GoogleAuthService {
  constructor(
    private readonly jwt: JwtService,
    private readonly sessions: SessionService,
  ) {}

  buildAuthUrl(scope: string[], state: string, options: { forceConsent?: boolean } = {}): string {
    const client = createOAuth2Client();
    return client.generateAuthUrl({
      access_type: "offline",
      scope,
      state,
      // Google only issues a refresh_token on the very first consent
      // unless prompt=consent is forced -- not needed by mandatory
      // linking itself, but kept for a future Calendar-sync reuse of this
      // same "connect" flow.
      ...(options.forceConsent ? { prompt: "consent" } : {}),
    });
  }

  async exchangeCode(code: string): Promise<GoogleIdentity> {
    const client = createOAuth2Client();
    const { tokens } = await client.getToken(code);
    if (!tokens.id_token) {
      throw new Error("Google did not return an ID token.");
    }
    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      // Safe to assume configured here -- createOAuth2Client() above
      // already throws if it isn't.
      audience: appConfig.googleAuth()!.clientId,
    });
    const payload = ticket.getPayload();
    if (!payload?.sub) {
      throw new Error("Google ID token did not include a subject claim.");
    }
    return {
      sub: payload.sub,
      email: payload.email ?? null,
      emailVerified: payload.email_verified ?? false,
      name: payload.name ?? null,
      picture: payload.picture ?? null,
    };
  }

  // Signed separately from the access token, short 10-minute TTL. This is
  // how the one /callback route tells "connect" and "login" apart, and
  // ties a "connect" attempt back to the user who started it -- signed so
  // the client can't tamper with either.
  signState(payload: GoogleState): Promise<string> {
    return this.jwt.signAsync(payload, { expiresIn: "10m" });
  }

  verifyState(token: string): Promise<GoogleState> {
    return this.jwt.verifyAsync<GoogleState>(token);
  }

  /**
   * Issues a session exactly like AuthService.login() does, for a user
   * already known to exist (by id, not credentials) -- used by the
   * "login" purpose once an already-linked Google identity is found.
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

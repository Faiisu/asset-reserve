import { Injectable } from "@nestjs/common";
import { appConfig } from "../config.js";
import type { ExternalIdentity } from "../auth/external-identity.js";
import { createOAuth2Client } from "./google-oauth-client.js";

/**
 * Google-specific OAuth mechanics only -- state signing, verification and
 * session issuance are provider-agnostic and live in
 * ExternalIdentitySessionService (auth/external-identity-session.service.ts),
 * shared with microsoft-auth/.
 */
@Injectable()
export class GoogleAuthService {
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

  async exchangeCode(code: string): Promise<ExternalIdentity> {
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
}

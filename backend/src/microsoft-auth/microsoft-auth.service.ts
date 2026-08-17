import { Injectable } from "@nestjs/common";
import type { ExternalIdentity } from "../auth/external-identity.js";
import { createMsalClient } from "./microsoft-oauth-client.js";

/**
 * Microsoft-specific OAuth mechanics only -- state signing, verification
 * and session issuance are provider-agnostic and live in
 * ExternalIdentitySessionService (auth/external-identity-session.service.ts),
 * shared with google-auth/.
 */
@Injectable()
export class MicrosoftAuthService {
  async buildAuthUrl(
    scopes: string[],
    state: string,
    redirectUri: string,
  ): Promise<string> {
    const client = createMsalClient();
    return client.getAuthCodeUrl({ scopes, redirectUri, state });
  }

  async exchangeCode(
    code: string,
    scopes: string[],
    redirectUri: string,
  ): Promise<ExternalIdentity> {
    const client = createMsalClient();
    const result = await client.acquireTokenByCode({ code, scopes, redirectUri });
    const account = result.account;
    if (!account) {
      throw new Error("Microsoft did not return account information.");
    }
    return {
      // homeAccountId is a stable, globally-unique identifier for this
      // account -- the closest equivalent to Google ID tokens' `sub`.
      sub: account.homeAccountId,
      // `username` is the preferred_username claim (the account's email
      // or UPN) -- Microsoft has no separate email_verified flag the way
      // Google does; a signed-in account's own preferred_username is
      // treated as reliable here, matching how most MSAL integrations
      // handle this.
      email: account.username || null,
      emailVerified: Boolean(account.username),
      name: account.name ?? null,
      // Unlike Google's ID token, Microsoft's has no public picture URL --
      // fetching one requires an authenticated Microsoft Graph
      // `/me/photo/$value` call and re-hosting the binary result on our
      // own storage. Out of scope for now; a Microsoft-linked user's
      // profilePictureUrl stays null unless already set some other way.
      picture: null,
    };
  }
}

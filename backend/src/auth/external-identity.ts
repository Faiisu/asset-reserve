/**
 * Shapes shared by every external identity provider (Google, Microsoft --
 * see google-auth/ and microsoft-auth/). A provider's *-auth.service.ts
 * only needs to produce one of these from its own SDK's response; state
 * signing and session issuance (external-identity-session.service.ts) and
 * the callback link/login logic (each provider's own controller) are
 * written against this shape, not against any one provider's SDK types.
 */

export type ExternalConnectState = { purpose: "connect"; userId: string };
export type ExternalLoginState = { purpose: "login" };
export type ExternalState = ExternalConnectState | ExternalLoginState;

export type ExternalIdentity = {
  /** Stable, provider-scoped subject identifier -- the value stored as
   * UserAuthIdentity.providerUserId. */
  sub: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
  picture: string | null;
};

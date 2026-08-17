import { ConfidentialClientApplication } from "@azure/msal-node";
import { appConfig } from "../config.js";

/**
 * Plain function, not a Nest provider -- same shape as
 * google-auth/google-oauth-client.ts's createOAuth2Client(). Throws if
 * Microsoft sign-in isn't configured; every caller that reaches this over
 * HTTP must check appConfig.microsoftAuth() itself first and turn an
 * unconfigured state into a clean 503, never let it surface as a raw
 * crash.
 */
export function createMsalClient(): ConfidentialClientApplication {
  const config = appConfig.microsoftAuth();
  if (!config) {
    throw new Error("Microsoft sign-in is not configured.");
  }
  return new ConfidentialClientApplication({
    auth: {
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      authority: `https://login.microsoftonline.com/${config.tenantId}`,
    },
  });
}

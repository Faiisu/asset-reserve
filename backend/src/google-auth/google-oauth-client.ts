import { OAuth2Client } from "google-auth-library";
import { appConfig } from "../config.js";

/**
 * Plain function, not a Nest provider -- keeps this dependency-free so a
 * future Calendar-sync module could reuse it without importing
 * GoogleAuthModule. Throws if Google sign-in isn't configured; every
 * caller that reaches this over HTTP must check appConfig.googleAuth()
 * itself first and turn an unconfigured state into a clean 503 -- never
 * let this surface as a raw 500.
 */
export function createOAuth2Client(): OAuth2Client {
  const config = appConfig.googleAuth();
  if (!config) {
    throw new Error("Google sign-in is not configured.");
  }
  return new OAuth2Client(config.clientId, config.clientSecret, config.redirectUri);
}

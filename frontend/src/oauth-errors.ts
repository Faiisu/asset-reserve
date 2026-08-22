// Error codes appended as ?googleError=/?microsoftError= by
// google-auth.controller.ts / microsoft-auth.controller.ts redirects.
// Shared between LoginPage (login flow) and ConnectAccountPage (connect
// flow) since both land on a page carrying one of these query params.

const GOOGLE_ERROR_MESSAGES: Record<string, string> = {
  not_linked: "That Google account isn't linked to any user yet. Sign in with your username and password, then link it from there.",
  inactive: "This account is disabled. Contact an administrator.",
  google_not_configured: "Google sign-in isn't set up for this deployment.",
  google_failed: "Something went wrong connecting to Google. Try again.",
};

const MICROSOFT_ERROR_MESSAGES: Record<string, string> = {
  not_linked: "That Microsoft account isn't linked to any user yet. Sign in with your username and password, then link it from there.",
  inactive: "This account is disabled. Contact an administrator.",
  microsoft_not_configured: "Microsoft sign-in isn't set up for this deployment.",
  microsoft_failed: "Something went wrong connecting to Microsoft. Try again.",
};

export function oauthErrorMessage(
  googleError: string | null,
  microsoftError: string | null,
): string {
  if (googleError) {
    return GOOGLE_ERROR_MESSAGES[googleError] ?? GOOGLE_ERROR_MESSAGES.google_failed;
  }
  if (microsoftError) {
    return MICROSOFT_ERROR_MESSAGES[microsoftError] ?? MICROSOFT_ERROR_MESSAGES.microsoft_failed;
  }
  return "";
}

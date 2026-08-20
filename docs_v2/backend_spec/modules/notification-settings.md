# Notification settings module

[← Backend specification](../README.md)

Global-admin SMTP/notification configuration, singleton settings. Source: `backend/src/notification-settings/`.

## Why this module exists

There is exactly one `NotificationSettings` row, addressed by a fixed id (`NOTIFICATION_SETTINGS_ID`) shared between this module (owns reads/writes) and `EmailService` (reads it to resolve the active SMTP config when sending). There is no create-a-new-settings-row flow — only get/upsert against that same id. Ownership/business rules: [software_spec/business-rules-and-validation.md §6](../../software_spec/business-rules-and-validation.md#6-recognition-email-templates-notification-settings).

## Routes

3 routes under `/notification-settings`, all requiring global admin (`@RequireGlobalAdmin()`). Full shapes: [contracts/paths/notification-settings.yaml](../contracts/paths/notification-settings.yaml), schemas in [contracts/components/schemas/notification-settings.yaml](../contracts/components/schemas/notification-settings.yaml).

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/notification-settings` | Returns all-blank defaults + `smtpPasswordSet: false` if never configured |
| PATCH | `/notification-settings` | Upserts the singleton row |
| POST | `/notification-settings/test` | Sends a test email to the caller's own account email |

## Implementation notes

- **Password handling**: the App Password is stored encrypted (`encryptSecret()`, backed by `TOKEN_ENCRYPTION_KEY`). `GET` never decrypts it to answer "is one saved" — `smtpPasswordSet` is purely "is the cipher column non-null." The plaintext secret is only ever decrypted by `EmailService`, immediately before sending.
- **Update semantics**: `smtpPassword` omitted or blank on `PATCH` keeps the existing cipher unchanged (reuses `existing.smtpAppPasswordCipher`); present and non-blank replaces it. On the very first save (`existing` is `null`) an empty `smtpPassword` is rejected with `422 VALIDATION_ERROR` — you cannot create the settings row without ever setting a password.
- If `TOKEN_ENCRYPTION_KEY` is not configured server-side, encryption throws and the endpoint responds `503 ENCRYPTION_NOT_CONFIGURED` rather than silently storing the password unencrypted.
- **Test email**: sent to `actor.user.email`, not an arbitrary address in the request body. Fails `422 NO_EMAIL_ON_FILE` if the caller has no email set (e.g. never linked Google/Microsoft and no self-service email set — see `users.md`/account-linking docs). Delivery failure from `EmailService.sendTestEmail()` surfaces as `502 TEST_EMAIL_FAILED` with the underlying error message.

// Fixed id for the one-and-only NotificationSettings row (singleton
// settings pattern -- there is no create-a-new-one flow, only get/upsert
// against this same id). Shared between NotificationSettingsService (owns
// reads/writes) and EmailService (reads it to resolve the active SMTP
// config), so it lives here rather than in either module specifically.
export const NOTIFICATION_SETTINGS_ID = "00000000-0000-4000-8000-000000000900";

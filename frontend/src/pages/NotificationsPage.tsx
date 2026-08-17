import { Send } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, ApiClientError } from "../api";
import { useAuth } from "../auth";
import {
  Button,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadingState,
  Notice,
} from "../components/ui";
import type { NotificationSettings } from "../types";

export function NotificationsPage() {
  const { isGlobalAdmin } = useAuth();
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [notice, setNotice] = useState("");

  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("465");
  const [smtpUser, setSmtpUser] = useState("");
  const [fromName, setFromName] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [smtpPassword, setSmtpPassword] = useState("");

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [testing, setTesting] = useState(false);
  const [testError, setTestError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const result = await api.notificationSettings();
      setSettings(result);
      setSmtpHost(result.smtpHost || "smtp.gmail.com");
      setSmtpPort(String(result.smtpPort || 465));
      setSmtpUser(result.smtpUser);
      setFromName(result.fromName);
      setFromEmail(result.fromEmail);
      setSmtpPassword("");
    } catch (caught) {
      setLoadError(caught);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isGlobalAdmin) void load();
  }, [isGlobalAdmin, load]);

  if (!isGlobalAdmin) {
    return (
      <EmptyState
        title="You cannot manage notification settings"
        description="Global admin access is required."
      />
    );
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaveError("");
    setTestError("");
    if (!smtpHost.trim() || !smtpUser.trim() || !fromName.trim() || !fromEmail.trim()) {
      setSaveError("All fields except App Password are required.");
      return;
    }
    const port = Number(smtpPort);
    if (!Number.isInteger(port) || port < 1 || port > 65_535) {
      setSaveError("Port must be a number between 1 and 65535.");
      return;
    }
    setSaving(true);
    try {
      const result = await api.updateNotificationSettings({
        smtpHost: smtpHost.trim(),
        smtpPort: port,
        smtpUser: smtpUser.trim(),
        fromName: fromName.trim(),
        fromEmail: fromEmail.trim(),
        ...(smtpPassword ? { smtpPassword } : {}),
      });
      setSettings(result);
      setSmtpPassword("");
      setNotice("Notification settings saved");
    } catch (caught) {
      setSaveError(
        caught instanceof ApiClientError
          ? caught.message
          : "Unable to save notification settings",
      );
    } finally {
      setSaving(false);
    }
  }

  async function sendTest() {
    setTestError("");
    setTesting(true);
    try {
      await api.sendTestNotification();
      setNotice("Test email sent -- check your inbox.");
    } catch (caught) {
      setTestError(
        caught instanceof ApiClientError
          ? caught.message
          : "Unable to send the test email",
      );
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="page-stack">
      {notice && <Notice>{notice}</Notice>}

      {loading ? (
        <LoadingState label="Loading notification settings" />
      ) : loadError ? (
        <ErrorState error={loadError} onRetry={() => void load()} />
      ) : (
        <section className="form-section">
          <div className="form-section__heading">
            <div>
              <h2>Email (Gmail SMTP)</h2>
              <p>
                Reservation submissions, decisions, and return outcomes are emailed through
                this account. Changes take effect immediately -- no redeploy needed.
              </p>
            </div>
            <span
              className={
                settings?.smtpPasswordSet
                  ? "status-badge status-badge--active"
                  : "status-badge status-badge--inactive"
              }
            >
              <span className="status-badge__dot" aria-hidden />
              {settings?.smtpPasswordSet ? "Configured" : "Not configured"}
            </span>
          </div>

          <form className="form-stack" onSubmit={save}>
            {saveError && (
              <div className="form-alert" role="alert">
                {saveError}
              </div>
            )}
            <div className="form-grid form-grid--2">
              <Field label="SMTP host" required>
                <Input
                  value={smtpHost}
                  onChange={(event) => setSmtpHost(event.target.value)}
                  placeholder="smtp.gmail.com"
                  required
                />
              </Field>
              <Field label="SMTP port" required>
                <Input
                  type="number"
                  min={1}
                  max={65_535}
                  value={smtpPort}
                  onChange={(event) => setSmtpPort(event.target.value)}
                  required
                />
              </Field>
            </div>
            <Field label="SMTP username" required hint="The Gmail or Workspace address that sends these emails">
              <Input
                value={smtpUser}
                onChange={(event) => setSmtpUser(event.target.value)}
                placeholder="notifications@yourcompany.com"
                required
              />
            </Field>
            <Field
              label="App password"
              hint={
                settings?.smtpPasswordSet
                  ? "Leave blank to keep the current password"
                  : "Generate one from your Google Account → Security → App Passwords"
              }
            >
              <Input
                type="password"
                value={smtpPassword}
                onChange={(event) => setSmtpPassword(event.target.value)}
                placeholder={settings?.smtpPasswordSet ? "••••••••" : ""}
                autoComplete="new-password"
              />
            </Field>
            <div className="form-grid form-grid--2">
              <Field label="From name" required>
                <Input
                  value={fromName}
                  onChange={(event) => setFromName(event.target.value)}
                  placeholder="Advantech Asset Reservation"
                  required
                />
              </Field>
              <Field label="From email" required>
                <Input
                  type="email"
                  value={fromEmail}
                  onChange={(event) => setFromEmail(event.target.value)}
                  placeholder="notifications@yourcompany.com"
                  required
                />
              </Field>
            </div>

            <div className="form-submit" style={{ display: "flex", gap: "10px" }}>
              <Button type="submit" loading={saving}>
                Save changes
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={!settings?.smtpPasswordSet}
                loading={testing}
                onClick={() => void sendTest()}
                title={
                  settings?.smtpPasswordSet
                    ? "Send a test email to your own address"
                    : "Save settings with an App Password first"
                }
              >
                <Send size={16} />
                Send test email
              </Button>
            </div>
            {testError && (
              <div className="form-alert" role="alert">
                {testError}
              </div>
            )}
          </form>
        </section>
      )}
    </div>
  );
}

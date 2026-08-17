import { useState, type FormEvent } from "react";
import { api, ApiClientError } from "../api";
import { useAuth } from "../auth";
import { Button, Field, Input, Notice } from "../components/ui";
import { GoogleIcon, MicrosoftIcon } from "../components/OAuthIcons";

type Provider = "google" | "microsoft";

const PROVIDER_LABEL: Record<Provider, string> = {
  google: "Google",
  microsoft: "Microsoft",
};

/**
 * Self-service profile management -- distinct from the mandatory-link gate
 * (ConnectAccountPage): reachable any time by any logged-in user, whether
 * or not REQUIRE_ACCOUNT_LINK is on. Exists mainly for deployments running
 * with the gate off (e.g. a customer whose corporate tenant blocks OAuth
 * consent for outside apps) -- lets a user supply their own notification
 * email/name themselves instead of an admin doing it via the Users page.
 * Google/Microsoft linking is offered here too, but framed as optional.
 */
export function AccountPage() {
  const { session, refresh } = useAuth();
  const user = session?.user;

  const [name, setName] = useState(user?.profile?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [savingInfo, setSavingInfo] = useState(false);
  const [infoError, setInfoError] = useState("");
  const [infoNotice, setInfoNotice] = useState("");

  const [connecting, setConnecting] = useState<Provider | null>(null);
  const [connectError, setConnectError] = useState("");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordNotice, setPasswordNotice] = useState("");

  if (!user) return null;

  async function saveInfo(event: FormEvent) {
    event.preventDefault();
    setInfoError("");
    setInfoNotice("");
    setSavingInfo(true);
    try {
      await api.updateMe({
        ...(name.trim() ? { name: name.trim() } : {}),
        ...(email.trim() ? { email: email.trim() } : {}),
      });
      await refresh();
      setInfoNotice("Your info has been updated.");
    } catch (caught) {
      setInfoError(
        caught instanceof ApiClientError
          ? caught.message
          : "Unable to save your info.",
      );
    } finally {
      setSavingInfo(false);
    }
  }

  async function startConnect(provider: Provider) {
    setConnecting(provider);
    setConnectError("");
    try {
      const { url } =
        provider === "google" ? await api.googleConnectUrl() : await api.microsoftConnectUrl();
      window.location.href = url;
    } catch (caught) {
      setConnectError(
        caught instanceof ApiClientError
          ? caught.message
          : `Could not reach ${PROVIDER_LABEL[provider]}. Try again.`,
      );
      setConnecting(null);
    }
  }

  async function savePassword(event: FormEvent) {
    event.preventDefault();
    setPasswordError("");
    setPasswordNotice("");
    if (newPassword !== confirmPassword) {
      setPasswordError("New password and confirmation don't match.");
      return;
    }
    setSavingPassword(true);
    try {
      await api.changeMyPassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordNotice("Your password has been changed.");
    } catch (caught) {
      setPasswordError(
        caught instanceof ApiClientError
          ? caught.message
          : "Unable to change your password.",
      );
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <div className="page-stack">
      <section className="form-section">
        <div className="form-section__heading">
          <div>
            <h2>Your info</h2>
            <p>
              Your name and the email used for reservation notifications. Nobody else can
              change this for you.
            </p>
          </div>
        </div>
        {infoNotice && <Notice>{infoNotice}</Notice>}
        <form className="form-stack" onSubmit={saveInfo}>
          {infoError && (
            <div className="form-alert" role="alert">
              {infoError}
            </div>
          )}
          <div className="form-grid form-grid--2">
            <Field label="Name">
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Jane Doe"
              />
            </Field>
            <Field label="Notification email" hint="Reservation and approval emails go here">
              <Input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="jane.doe@yourcompany.com"
              />
            </Field>
          </div>
          <div className="form-submit">
            <Button type="submit" loading={savingInfo}>
              Save changes
            </Button>
          </div>
        </form>
      </section>

      <section className="form-section">
        <div className="form-section__heading">
          <div>
            <h2>Linked accounts</h2>
            <p>
              Optional -- link a Google or Microsoft account for quick sign-in. Not required
              to use the app.
            </p>
          </div>
        </div>
        {connectError && (
          <div className="form-alert" role="alert">
            {connectError}
          </div>
        )}
        <div className="form-stack">
          {(["google", "microsoft"] as const).map((provider) => {
            const linked = user.linkedProviders.includes(provider);
            const Icon = provider === "google" ? GoogleIcon : MicrosoftIcon;
            return (
              <div key={provider} className="form-grid form-grid--2" style={{ alignItems: "center" }}>
                <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <Icon /> {PROVIDER_LABEL[provider]}
                </span>
                {linked ? (
                  <span className="status-badge status-badge--active">
                    <span className="status-badge__dot" aria-hidden />
                    Connected
                  </span>
                ) : (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    loading={connecting === provider}
                    disabled={connecting !== null && connecting !== provider}
                    onClick={() => void startConnect(provider)}
                  >
                    Connect
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="form-section">
        <div className="form-section__heading">
          <div>
            <h2>Change password</h2>
            <p>Choose a new password of at least 8 characters.</p>
          </div>
        </div>
        {passwordNotice && <Notice>{passwordNotice}</Notice>}
        <form className="form-stack" onSubmit={savePassword}>
          {passwordError && (
            <div className="form-alert" role="alert">
              {passwordError}
            </div>
          )}
          <Field label="Current password" required>
            <Input
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              required
            />
          </Field>
          <div className="form-grid form-grid--2">
            <Field label="New password" required hint="At least 8 characters">
              <Input
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                required
              />
            </Field>
            <Field label="Confirm new password" required>
              <Input
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
              />
            </Field>
          </div>
          <div className="form-submit">
            <Button type="submit" loading={savingPassword}>
              Change password
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}

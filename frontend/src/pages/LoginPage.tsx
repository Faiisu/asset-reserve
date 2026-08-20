import {
  AlertCircle,
  ArrowRight,
  KeyRound,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { ApiClientError } from "../api";
import { useAuth } from "../auth";
import { Button, Field, Input } from "../components/ui";
import { GoogleIcon, MicrosoftIcon } from "../components/OAuthIcons";

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

export function LoginPage() {
  const { session, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const googleError = searchParams.get("googleError");
  const microsoftError = searchParams.get("microsoftError");
  const oauthErrorMessage = googleError
    ? (GOOGLE_ERROR_MESSAGES[googleError] ?? GOOGLE_ERROR_MESSAGES.google_failed)
    : microsoftError
      ? (MICROSOFT_ERROR_MESSAGES[microsoftError] ?? MICROSOFT_ERROR_MESSAGES.microsoft_failed)
      : "";

  if (session) return <Navigate to="/" replace />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await login(username, password);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from && from !== "/login" ? from : "/", { replace: true });
    } catch (caught) {
      setError(
        caught instanceof ApiClientError && caught.status === 403
          ? "This account is disabled. Contact an administrator."
          : "Username or password is incorrect.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-story">
        <div className="login-story__content">
          <span className="advantech-badge">ADVANTECH</span>
          <h1 className="login-title">
            Advantech
            <em>Asset Reservation</em>
          </h1>
        </div>
        <div className="login-story__foot">
          <span>Advantech</span>
          <span>Asset Reservation</span>
        </div>
      </section>

      <section className="login-panel">
        <div className="login-form-wrap">
          <div className="login-form__mark">
            <KeyRound size={22} />
          </div>
          <p className="eyebrow">Authorized personnel</p>
          <h2>Sign in to your workspace</h2>
          <p className="login-form__intro">Use the account created for you by an administrator.</p>
          <form onSubmit={submit} noValidate>
            <Field label="Username" required>
              <Input
                type="text"
                name="username"
                autoComplete="username"
                placeholder="jane.doe"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                required
              />
            </Field>
            <Field label="Password" required>
              <Input
                type="password"
                name="password"
                autoComplete="current-password"
                placeholder="••••••••••••"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </Field>
            <div className="login-alert-slot" aria-live="polite">
              {(error || oauthErrorMessage) && (
                <div className="form-alert" role="alert">
                  <AlertCircle size={16} aria-hidden />
                  <span>{error || oauthErrorMessage}</span>
                </div>
              )}
            </div>
            <Button
              className="login-submit"
              type="submit"
              loading={submitting}
              disabled={!username || !password}
            >
              Sign in <ArrowRight size={17} />
            </Button>
          </form>
          <a
            href="/api/v1/auth/google/login"
            className="button button--secondary button--md login-oauth"
          >
            <GoogleIcon /> Continue with Google
          </a>
          <a
            href="/api/v1/auth/microsoft/login"
            className="button button--secondary button--md login-oauth"
          >
            <MicrosoftIcon /> Continue with Microsoft
          </a>
          <p className="login-help">
            Unable to sign in? Contact an administrator to activate your
            account or check your access.
          </p>
        </div>
      </section>
    </main>
  );
}

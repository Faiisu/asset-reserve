import {
  AlertCircle,
  ArrowRight,
  KeyRound,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { ApiClientError } from "../api";
import { useAuth } from "../auth";
import { Button, Field, Input } from "../components/ui";

export function LoginPage() {
  const { session, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  if (session) return <Navigate to="/" replace />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await login(email, password);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from && from !== "/login" ? from : "/", { replace: true });
    } catch (caught) {
      setError(
        caught instanceof ApiClientError && caught.status === 403
          ? "This account is disabled. Contact an administrator."
          : "Incorrect email or password",
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
            <Field label="Email" required>
              <Input
                type="email"
                name="email"
                autoComplete="email"
                placeholder="name@company.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </Field>
            <Field label="Password" hint="At least 12 characters" required>
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
            {error && (
              <div className="form-alert" role="alert">
                <AlertCircle size={16} aria-hidden />
                <span>{error}</span>
              </div>
            )}
            <Button
              className="login-submit"
              type="submit"
              loading={submitting}
              disabled={!email || !password}
            >
              Sign in <ArrowRight size={17} />
            </Button>
          </form>
          <p className="login-help">
            Unable to sign in? Contact an administrator to activate your
            account or check your access.
          </p>
        </div>
      </section>
    </main>
  );
}

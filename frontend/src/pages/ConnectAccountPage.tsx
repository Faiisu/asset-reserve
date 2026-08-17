import { AlertCircle, LogOut, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { api, ApiClientError } from "../api";
import { useAuth } from "../auth";
import { Button } from "../components/ui";
import { GoogleIcon, MicrosoftIcon } from "../components/OAuthIcons";

type Provider = "google" | "microsoft";

/**
 * Hard block: every user must link an external account (Google or
 * Microsoft -- either satisfies it) before using the app (enforced
 * server-side too, by AccountLinkGuard -- this page is the UX for that
 * gate, not the enforcement). No skip/dismiss control by design.
 *
 * Both /connect endpoints require the current session (they tie the new
 * identity to whoever is logged in), so neither can be a plain
 * `<a href>` -- a browser-initiated navigation can't carry the Bearer
 * token. Fetch the consent URL like any other authenticated call, then
 * navigate the browser there ourselves.
 */
export function ConnectAccountPage() {
  const { logout } = useAuth();
  const [starting, setStarting] = useState<Provider | null>(null);
  const [error, setError] = useState("");

  async function startConnect(provider: Provider) {
    setStarting(provider);
    setError("");
    try {
      const { url } =
        provider === "google" ? await api.googleConnectUrl() : await api.microsoftConnectUrl();
      window.location.href = url;
    } catch (caught) {
      setError(
        caught instanceof ApiClientError
          ? caught.message
          : `Could not reach ${provider === "google" ? "Google" : "Microsoft"}. Try again.`,
      );
      setStarting(null);
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
            <ShieldCheck size={22} />
          </div>
          <p className="eyebrow">One more step</p>
          <h2>Connect an account</h2>
          <p className="login-form__intro">
            Every account must be linked to Google or Microsoft before it can be used.
            Linking is also where your name, email, and photo come from -- there&apos;s
            nothing else to fill in.
          </p>
          <div className="login-alert-slot" aria-live="polite">
            {error && (
              <div className="form-alert" role="alert">
                <AlertCircle size={16} aria-hidden />
                <span>{error}</span>
              </div>
            )}
          </div>
          <Button
            className="login-submit"
            loading={starting === "google"}
            disabled={starting === "microsoft"}
            onClick={() => void startConnect("google")}
          >
            <GoogleIcon /> Continue with Google
          </Button>
          <Button
            className="login-oauth"
            variant="secondary"
            loading={starting === "microsoft"}
            disabled={starting === "google"}
            onClick={() => void startConnect("microsoft")}
          >
            <MicrosoftIcon /> Continue with Microsoft
          </Button>
          <p className="login-help">
            <button
              type="button"
              className="button button--quiet button--sm"
              onClick={() => void logout()}
            >
              <LogOut size={14} /> Not you? Log out
            </button>
          </p>
        </div>
      </section>
    </main>
  );
}

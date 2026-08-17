import { AlertCircle, LogOut, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { api, ApiClientError } from "../api";
import { useAuth } from "../auth";
import { Button } from "../components/ui";

/**
 * Hard block: every user must link a Google account before using the app
 * (enforced server-side too, by GoogleLinkGuard -- this page is the UX for
 * that gate, not the enforcement). No skip/dismiss control by design.
 *
 * The "connect" endpoint requires the current session (it ties the new
 * Google identity to whoever is logged in), so it can't be a plain
 * `<a href>` -- a browser-initiated navigation can't carry the Bearer
 * token. Fetch the consent URL like any other authenticated call, then
 * navigate the browser there ourselves.
 */
export function ConnectGooglePage() {
  const { logout } = useAuth();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");

  async function startConnect() {
    setStarting(true);
    setError("");
    try {
      const { url } = await api.googleConnectUrl();
      window.location.href = url;
    } catch (caught) {
      setError(
        caught instanceof ApiClientError
          ? caught.message
          : "Could not reach Google. Try again.",
      );
      setStarting(false);
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
          <h2>Connect your Google account</h2>
          <p className="login-form__intro">
            Every account must be linked to Google before it can be used. Linking is
            also where your name, email, and photo come from -- there&apos;s nothing
            else to fill in.
          </p>
          <div className="login-alert-slot" aria-live="polite">
            {error && (
              <div className="form-alert" role="alert">
                <AlertCircle size={16} aria-hidden />
                <span>{error}</span>
              </div>
            )}
          </div>
          <Button className="login-submit" loading={starting} onClick={() => void startConnect()}>
            Continue with Google
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

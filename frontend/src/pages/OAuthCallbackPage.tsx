import { LoaderCircle } from "lucide-react";
import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { setAccessToken } from "../api";
import { useAuth } from "../auth";

/**
 * Lands here after a "Continue with Google/Microsoft" direct login (the
 * "login" purpose, for an already-linked identity -- unlike the
 * "connect" flow, there's no pre-existing session here, so the backend
 * hands back a fresh token in the query string). Shared by both
 * providers -- neither's callback logic differs from this point on.
 */
export function OAuthCallbackPage() {
  const [params] = useSearchParams();
  const { refresh } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const token = params.get("token");
    if (!token) {
      navigate("/login?googleError=google_failed", { replace: true });
      return;
    }
    setAccessToken(token);
    void refresh().then(() => navigate("/", { replace: true }));
    // Runs once on mount against the token present at load time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="boot-screen">
      <LoaderCircle className="spin" />
      <span>Signing you in</span>
    </div>
  );
}

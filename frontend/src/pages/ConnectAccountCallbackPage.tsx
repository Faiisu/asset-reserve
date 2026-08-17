import { LoaderCircle } from "lucide-react";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth";

/**
 * Lands here after either provider's "connect" callback redirect (both
 * Google and Microsoft redirect to this same shared path). The browser
 * already holds a valid session token from before the detour -- no new
 * token to read, just re-fetch /bff/session (now showing the newly
 * linked provider in linkedProviders) and continue into the app.
 */
export function ConnectAccountCallbackPage() {
  const { refresh } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    void refresh().then(() => navigate("/", { replace: true }));
    // Runs once on mount -- refresh/navigate identity churn shouldn't
    // re-trigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="boot-screen">
      <LoaderCircle className="spin" />
      <span>Finishing up</span>
    </div>
  );
}

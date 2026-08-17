import { LoaderCircle } from "lucide-react";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth";

/**
 * Lands here after the backend's "connect" callback redirect. The browser
 * already holds a valid session token from before the Google detour --
 * no new token to read, just re-fetch /bff/session (now showing
 * googleLinked: true) and continue into the app.
 */
export function ConnectGoogleCallbackPage() {
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

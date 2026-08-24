import { LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "./auth";
import { AppShell } from "./components/AppShell";
import { AccessPage } from "./pages/AccessPage";
import { AccountPage } from "./pages/AccountPage";
import { ApprovalRequestsPage } from "./pages/ApprovalRequestsPage";
import { AssetDetailPage } from "./pages/AssetDetailPage";
import { AssetFormPage } from "./pages/AssetFormPage";
import { AssetsPage } from "./pages/AssetsPage";
import { CalendarPage } from "./pages/CalendarPage";
import { ConnectAccountCallbackPage } from "./pages/ConnectAccountCallbackPage";
import { ConnectAccountPage } from "./pages/ConnectAccountPage";
import { OAuthCallbackPage } from "./pages/OAuthCallbackPage";
import { LoginPage } from "./pages/LoginPage";
import { ReservationCreatePage } from "./pages/ReservationCreatePage";
import { ReservationDetailPage } from "./pages/ReservationDetailPage";
import { ReservationsPage } from "./pages/ReservationsPage";
import { ManagementAreasPage } from "./pages/ManagementAreasPage";
import { NotificationsPage } from "./pages/NotificationsPage";
import { ReputationHistoryPage } from "./pages/ReputationHistoryPage";
import { ReputationPage } from "./pages/ReputationPage";
import { StatisticPage } from "./pages/StatisticPage";
import { UsersPage } from "./pages/UsersPage";

function BootScreen({ label }: { label: string }) {
  return (
    <div className="boot-screen">
      <LoaderCircle className="spin" />
      <span>{label}</span>
    </div>
  );
}

/** A session is required, but neither AppShell chrome nor the mandatory
 * account-link gate applies -- used for the connect-account pages
 * themselves (the gate's own UI would otherwise never be reachable). */
function RequireSession({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  const location = useLocation();
  if (loading) return <BootScreen label="Opening workspace" />;
  if (!session)
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

function ProtectedApp() {
  const { session, loading } = useAuth();
  const location = useLocation();
  if (loading) return <BootScreen label="Opening workspace" />;
  if (!session)
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  // Hard block, no skip: every user must link an external account
  // (Google or Microsoft -- either satisfies it) before using the rest
  // of the app once REQUIRE_ACCOUNT_LINK is on (see
  // appConfig.requireAccountLink() and AccountLinkGuard on the backend --
  // this is the UX for that gate, not the enforcement of it).
  if (
    session.user.accountLinkRequired &&
    session.user.linkedProviders.length === 0
  ) {
    return <Navigate to="/connect-account" replace />;
  }
  return <AppShell />;
}

function HomeRedirect() {
  return <Navigate to="/calendar" replace />;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/auth/callback" element={<OAuthCallbackPage />} />
      <Route
        path="/connect-account"
        element={
          <RequireSession>
            <ConnectAccountPage />
          </RequireSession>
        }
      />
      <Route
        path="/connect-account/callback"
        element={
          <RequireSession>
            <ConnectAccountCallbackPage />
          </RequireSession>
        }
      />
      <Route element={<ProtectedApp />}>
        <Route index element={<HomeRedirect />} />
        <Route path="account" element={<AccountPage />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="assets" element={<AssetsPage />} />
        <Route path="assets/new" element={<AssetFormPage />} />
        <Route
          path="asset/new"
          element={<Navigate to="/assets/new" replace />}
        />
        <Route path="assets/:assetId" element={<AssetDetailPage />} />
        <Route path="assets/:assetId/edit" element={<AssetFormPage />} />
        <Route path="statistic" element={<StatisticPage />} />
        <Route path="reservations" element={<ReservationsPage />} />
        <Route path="approvals" element={<ApprovalRequestsPage />} />
        <Route path="reservations/new" element={<ReservationCreatePage />} />
        <Route
          path="reservations/:reservationId"
          element={<ReservationDetailPage />}
        />
        <Route path="admin/access" element={<AccessPage />} />
        <Route path="admin/users" element={<UsersPage />} />
        <Route path="admin/areas" element={<ManagementAreasPage />} />
        <Route path="admin/notifications" element={<NotificationsPage />} />
        <Route path="admin/reputation" element={<ReputationPage />} />
        <Route
          path="admin/reputation/:userId"
          element={<ReputationHistoryPage />}
        />
        <Route
          path="admin/templates"
          element={<Navigate to="/admin/areas" replace />}
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

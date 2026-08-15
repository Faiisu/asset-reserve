import { LoaderCircle } from "lucide-react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "./auth";
import { AppShell } from "./components/AppShell";
import { AccessPage } from "./pages/AccessPage";
import { AssetDetailPage } from "./pages/AssetDetailPage";
import { AssetFormPage } from "./pages/AssetFormPage";
import { AssetsPage } from "./pages/AssetsPage";
import { CalendarPage } from "./pages/CalendarPage";
import { LoginPage } from "./pages/LoginPage";
import { ReservationCreatePage } from "./pages/ReservationCreatePage";
import { ReservationDetailPage } from "./pages/ReservationDetailPage";
import { ReservationsPage } from "./pages/ReservationsPage";
import { TemplatesPage } from "./pages/TemplatesPage";
import { UsersPage } from "./pages/UsersPage";

function ProtectedApp() {
  const { session, loading } = useAuth();
  const location = useLocation();
  if (loading)
    return (
      <div className="boot-screen">
        <LoaderCircle className="spin" />
        <span>Opening workspace</span>
      </div>
    );
  if (!session)
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <AppShell />;
}

function HomeRedirect() {
  return <Navigate to="/calendar" replace />;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedApp />}>
        <Route index element={<HomeRedirect />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="assets" element={<AssetsPage />} />
        <Route path="assets/new" element={<AssetFormPage />} />
        <Route path="asset/new" element={<Navigate to="/assets/new" replace />} />
        <Route path="assets/:assetId" element={<AssetDetailPage />} />
        <Route path="assets/:assetId/edit" element={<AssetFormPage />} />
        <Route path="reservations" element={<ReservationsPage />} />
        <Route path="reservations/new" element={<ReservationCreatePage />} />
        <Route
          path="reservations/:reservationId"
          element={<ReservationDetailPage />}
        />
        <Route path="admin/access" element={<AccessPage />} />
        <Route path="admin/users" element={<UsersPage />} />
        <Route path="admin/templates" element={<TemplatesPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

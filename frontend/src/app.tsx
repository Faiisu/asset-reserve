import { LoaderCircle } from "lucide-react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "./auth";
import { AppShell } from "./components/AppShell";
import { AccessPage } from "./pages/AccessPage";
import { AssetDetailPage } from "./pages/AssetDetailPage";
import { AssetFormPage } from "./pages/AssetFormPage";
import { AssetsPage } from "./pages/AssetsPage";
import { LoginPage } from "./pages/LoginPage";
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
  const { hasPermission, isGlobalAdmin, hasGlobalPermission } = useAuth();
  if (hasPermission("asset:view")) return <Navigate to="/assets" replace />;
  if (isGlobalAdmin) return <Navigate to="/admin/access" replace />;
  if (
    ["user:create", "user:disable", "role:assign"].some((value) =>
      hasGlobalPermission(value as "user:create"),
    )
  ) {
    return <Navigate to="/admin/users" replace />;
  }
  return <Navigate to="/login" replace />;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedApp />}>
        <Route index element={<HomeRedirect />} />
        <Route path="assets" element={<AssetsPage />} />
        <Route path="assets/new" element={<AssetFormPage />} />
        <Route path="assets/:assetId" element={<AssetDetailPage />} />
        <Route path="assets/:assetId/edit" element={<AssetFormPage />} />
        <Route path="admin/access" element={<AccessPage />} />
        <Route path="admin/users" element={<UsersPage />} />
        <Route path="admin/templates" element={<TemplatesPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

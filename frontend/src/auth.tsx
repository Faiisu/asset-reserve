import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api, getAccessToken, setAccessToken } from "./api";
import type { PermissionKey, SessionContext } from "./types";

type AuthContextValue = {
  session: SessionContext | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  hasGlobalPermission: (permission: PermissionKey) => boolean;
  hasPermission: (permission: PermissionKey) => boolean;
  hasAreaPermission: (
    permission: PermissionKey,
    managementAreaId: string,
  ) => boolean;
  isGlobalAdmin: boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionContext | null>(null);
  const [loading, setLoading] = useState(Boolean(getAccessToken()));

  const clearSession = useCallback(() => {
    setAccessToken(null);
    setSession(null);
    setLoading(false);
  }, []);

  const refresh = useCallback(async () => {
    if (!getAccessToken()) {
      clearSession();
      return;
    }
    setLoading(true);
    try {
      const response = await api.session();
      setSession(response.session);
    } catch {
      clearSession();
    } finally {
      setLoading(false);
    }
  }, [clearSession]);

  useEffect(() => {
    void refresh();
    window.addEventListener("asset-rail:unauthorized", clearSession);
    return () =>
      window.removeEventListener("asset-rail:unauthorized", clearSession);
  }, [clearSession, refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const response = await api.login(email, password);
    setAccessToken(response.accessToken);
    setSession(response.session);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      clearSession();
    }
  }, [clearSession]);

  const value = useMemo<AuthContextValue>(() => {
    const global = new Set(session?.effectivePermissions.global ?? []);
    const scoped = new Set(
      session?.effectivePermissions.byManagementArea.flatMap(
        (area) => area.permissions,
      ) ?? [],
    );
    return {
      session,
      loading,
      login,
      logout,
      refresh,
      hasGlobalPermission: (permission) => global.has(permission),
      hasPermission: (permission) =>
        global.has(permission) || scoped.has(permission),
      hasAreaPermission: (permission, managementAreaId) =>
        global.has(permission) ||
        (session?.effectivePermissions.byManagementArea
          .find((area) => area.managementAreaId === managementAreaId)
          ?.permissions.includes(permission) ??
          false),
      isGlobalAdmin:
        session?.roles.some(
          (role) => role.name === "ADMIN" && !role.managementArea,
        ) ?? false,
    };
  }, [session, loading, login, logout, refresh]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}

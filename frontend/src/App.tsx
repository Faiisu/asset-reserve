import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ApiError, createApiClient } from "./api";
import { decodeTokenClaims, formatDuration, secondsUntilExpiry } from "./token";
import type {
  PermissionDefinition,
  RequestDiagnostic,
  RoleDefinition,
  SessionContext,
} from "./types";

const TOKEN_STORAGE_KEY = "asset-reservation.auth-bench.access-token";
const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000/api/v1";

function Icon({
  name,
}: {
  name: "arrow" | "check" | "copy" | "eye" | "refresh" | "signout" | "user";
}) {
  const paths = {
    arrow: <path d="m5 12 14 0m-5-5 5 5-5 5" />,
    check: <path d="m5 12 4 4L19 6" />,
    copy: <path d="M8 8h11v11H8zM5 16H4V4h12v1" />,
    eye: (
      <>
        <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
        <circle cx="12" cy="12" r="2.5" />
      </>
    ),
    refresh: (
      <>
        <path d="M20 7v5h-5" />
        <path d="M19 12a7 7 0 1 1-2-5" />
      </>
    ),
    signout: (
      <>
        <path d="M10 5H5v14h5M13 8l4 4-4 4m-5-4h9" />
      </>
    ),
    user: (
      <>
        <circle cx="12" cy="8" r="3" />
        <path d="M5 20a7 7 0 0 1 14 0" />
      </>
    ),
  };
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

function CredentialRail({ signedIn }: { signedIn: boolean }) {
  return (
    <aside className="credential-rail" aria-label="Application identity">
      <div className="rail-mark">AR</div>
      <div className="rail-title" aria-hidden="true">
        AUTH BENCH
      </div>
      <div className={`rail-state ${signedIn ? "is-live" : ""}`}>
        <span className="state-dot" />
        <span>{signedIn ? "SESSION LIVE" : "AWAITING KEY"}</span>
      </div>
      <div className="rail-version">
        CONTRACT
        <br />
        V1.0
      </div>
    </aside>
  );
}

function Diagnostics({ items }: { items: RequestDiagnostic[] }) {
  return (
    <section className="diagnostics panel" aria-labelledby="diagnostic-title">
      <header className="panel-heading compact-heading">
        <div>
          <p className="eyebrow">Network trace</p>
          <h2 id="diagnostic-title">คำขอล่าสุด</h2>
        </div>
        <span className="counter">{String(items.length).padStart(2, "0")}</span>
      </header>
      {items.length === 0 ? (
        <div className="empty-trace">
          <span className="trace-line" />
          <p>ยังไม่มี request เริ่มจากตรวจ API หรือเข้าสู่ระบบ</p>
        </div>
      ) : (
        <ol className="trace-list">
          {items.map((item) => (
            <li key={item.id} className={`trace-row trace-${item.outcome}`}>
              <span className="trace-method">{item.method}</span>
              <div className="trace-target">
                <strong>{item.path}</strong>
                <small>
                  {new Date(item.occurredAt).toLocaleTimeString("th-TH")}
                </small>
              </div>
              <div className="trace-result">
                <strong>{item.status ?? "OFF"}</strong>
                <small>{item.durationMs} ms</small>
              </div>
            </li>
          ))}
        </ol>
      )}
      <footer className="diagnostic-footer">
        <span>API</span>
        <code title={API_BASE_URL}>{API_BASE_URL}</code>
      </footer>
    </section>
  );
}

function ErrorNotice({
  error,
  onDismiss,
}: {
  error: ApiError;
  onDismiss: () => void;
}) {
  return (
    <div className="error-notice" role="alert">
      <div>
        <strong>{error.code}</strong>
        <p>{error.message}</p>
        {error.requestId && <code>Request {error.requestId}</code>}
      </div>
      <button type="button" onClick={onDismiss} aria-label="ปิดข้อความผิดพลาด">
        ×
      </button>
    </div>
  );
}

type LoginPanelProps = {
  loading: boolean;
  restoring: boolean;
  error: ApiError | null;
  probeResult: "idle" | "running" | "passed" | "failed";
  onLogin: (email: string, password: string) => Promise<void>;
  onProbe: () => Promise<void>;
  onDismissError: () => void;
};

function LoginPanel({
  loading,
  restoring,
  error,
  probeResult,
  onLogin,
  onProbe,
  onDismissError,
}: LoginPanelProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onLogin(email, password);
  }

  return (
    <main className="signed-out-main">
      <section className="intro-block">
        <div className="contract-chip">
          <span />
          Authentication contract / v1
        </div>
        <h1>
          พิสูจน์ตัวตน
          <br />
          <em>ก่อนเชื่อสิทธิ์</em>
        </h1>
        <p className="intro-copy">
          หน้าทดสอบสำหรับตรวจ password login, access token, session context และ
          management-area scope กับ backend จริง
        </p>
        <div className="flow-line" aria-label="Authentication flow">
          <span>Credentials</span>
          <i />
          <span>JWT</span>
          <i />
          <span>Session</span>
          <i />
          <span>RBAC</span>
        </div>
      </section>

      <section className="login-panel panel" aria-labelledby="login-title">
        <header className="panel-heading">
          <div>
            <p className="eyebrow">Password flow</p>
            <h2 id="login-title">เข้าสู่ระบบทดสอบ</h2>
          </div>
          <span className="step-mark">01</span>
        </header>
        {error && <ErrorNotice error={error} onDismiss={onDismissError} />}
        <form onSubmit={submit}>
          <label className="field">
            <span>Email</span>
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="admin@example.com"
              maxLength={255}
              required
            />
          </label>
          <label className="field">
            <span>Password</span>
            <span className="password-control">
              <input
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="อย่างน้อย 12 ตัวอักษร"
                maxLength={1024}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
              >
                <Icon name="eye" />
              </button>
            </span>
          </label>
          <button
            className="primary-action"
            type="submit"
            disabled={loading || restoring}
          >
            <span>
              {restoring
                ? "กำลังตรวจ session"
                : loading
                  ? "กำลังยืนยัน"
                  : "ยืนยัน credentials"}
            </span>
            <Icon name="arrow" />
          </button>
        </form>
        <div className="probe-row">
          <div>
            <strong>ตรวจ Authentication Guard</strong>
            <span>คาดหวัง 401 เมื่อไม่ส่ง token</span>
          </div>
          <button
            type="button"
            onClick={() => void onProbe()}
            disabled={probeResult === "running"}
            className={`probe-button probe-${probeResult}`}
          >
            {probeResult === "passed" ? (
              <>
                <Icon name="check" /> ผ่าน
              </>
            ) : probeResult === "running" ? (
              "กำลังตรวจ"
            ) : (
              "Run probe"
            )}
          </button>
        </div>
        <p className="storage-note">
          Access token ถูกเก็บใน sessionStorage สำหรับ test bench
          นี้และจะถูกล้างเมื่อปิด tab
        </p>
      </section>
    </main>
  );
}

function TokenClock({
  expiresIn,
  ratio,
}: {
  expiresIn: number | null;
  ratio: number;
}) {
  return (
    <div
      className={`token-clock ${expiresIn === 0 ? "is-expired" : ""}`}
      style={{ "--life": `${Math.round(ratio * 100)}%` } as React.CSSProperties}
    >
      <div className="clock-face">
        <span>TTL</span>
        <strong>{formatDuration(expiresIn)}</strong>
        <small>{expiresIn === 0 ? "EXPIRED" : "ACCESS TOKEN"}</small>
      </div>
    </div>
  );
}

function PermissionInspector({
  session,
  catalog,
}: {
  session: SessionContext;
  catalog: PermissionDefinition[];
}) {
  const resourceOrder = [
    ...new Set(catalog.map((permission) => permission.resource)),
  ];
  const scoped = session.effectivePermissions.byManagementArea;
  return (
    <section
      className="permission-panel panel"
      aria-labelledby="permission-title"
    >
      <header className="panel-heading compact-heading">
        <div>
          <p className="eyebrow">Effective access</p>
          <h2 id="permission-title">Permission matrix</h2>
        </div>
        <span className="counter">
          {session.effectivePermissions.global.length +
            scoped.reduce((sum, area) => sum + area.permissions.length, 0)}
        </span>
      </header>
      <div className="permission-scope">
        <div className="scope-label">
          <strong>GLOBAL</strong>
          <span>{session.effectivePermissions.global.length} keys</span>
        </div>
        <div className="permission-groups">
          {resourceOrder.map((resource) => {
            const permissions = catalog.filter(
              (item) => item.resource === resource,
            );
            return (
              <div className="permission-group" key={resource}>
                <h3>{resource}</h3>
                <div>
                  {permissions.map((permission) => (
                    <span
                      key={permission.key}
                      className={
                        session.effectivePermissions.global.includes(
                          permission.key,
                        )
                          ? "permission-on"
                          : "permission-off"
                      }
                      title={permission.description}
                    >
                      {permission.action}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {scoped.length > 0 && (
        <div className="area-scopes">
          {scoped.map((area) => {
            const areaName =
              session.roles.find(
                (role) => role.managementArea?.id === area.managementAreaId,
              )?.managementArea?.name ?? area.managementAreaId;
            return (
              <div className="area-scope" key={area.managementAreaId}>
                <div>
                  <strong>{areaName}</strong>
                  <code>{area.managementAreaId.slice(0, 8)}</code>
                </div>
                <span>{area.permissions.length} effective permissions</span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

type DashboardProps = {
  session: SessionContext;
  token: string;
  permissions: PermissionDefinition[];
  roles: RoleDefinition[];
  error: ApiError | null;
  refreshing: boolean;
  onRefresh: () => Promise<void>;
  onLogout: () => Promise<void>;
  onDismissError: () => void;
};

function Dashboard({
  session,
  token,
  permissions,
  roles,
  error,
  refreshing,
  onRefresh,
  onLogout,
  onDismissError,
}: DashboardProps) {
  const claims = useMemo(() => decodeTokenClaims(token), [token]);
  const [remaining, setRemaining] = useState(() => secondsUntilExpiry(claims));
  useEffect(() => {
    setRemaining(secondsUntilExpiry(claims));
    const timer = window.setInterval(
      () => setRemaining(secondsUntilExpiry(claims)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [claims]);
  const lifetime = claims?.exp && claims.iat ? claims.exp - claims.iat : 900;
  const ratio =
    remaining === null ? 0 : Math.max(0, Math.min(1, remaining / lifetime));

  return (
    <main className="dashboard-main">
      <header className="session-header">
        <div>
          <p className="eyebrow">Authenticated identity</p>
          <h1>{session.user.profile?.name ?? session.user.email}</h1>
          <span>{session.user.email}</span>
        </div>
        <div className="header-actions">
          <button
            type="button"
            onClick={() => void onRefresh()}
            disabled={refreshing}
            className="secondary-action"
          >
            <Icon name="refresh" />
            {refreshing ? "กำลังตรวจ" : "ตรวจ session"}
          </button>
          <button
            type="button"
            onClick={() => void onLogout()}
            className="secondary-action signout"
          >
            <Icon name="signout" />
            ออกจากระบบ
          </button>
        </div>
      </header>
      {error && <ErrorNotice error={error} onDismiss={onDismissError} />}
      <div className="dashboard-grid">
        <section className="identity-card panel">
          <div className="identity-top">
            <div className="avatar">
              <Icon name="user" />
            </div>
            <div>
              <span>SUBJECT</span>
              <code>{session.user.id}</code>
            </div>
            <span className="verified-stamp">
              <Icon name="check" /> ACTIVE
            </span>
          </div>
          <div className="role-stack">
            {session.roles.length ? (
              session.roles.map((role) => (
                <article key={role.assignmentId} className="role-card">
                  <div>
                    <strong>{role.name}</strong>
                    <span>{role.managementArea?.name ?? "Global scope"}</span>
                  </div>
                  <small>{role.permissions.length} permissions</small>
                </article>
              ))
            ) : (
              <p className="empty-role">บัญชีนี้ยังไม่มี role assignment</p>
            )}
          </div>
          <div className="known-roles">
            <span>Role definitions loaded</span>
            <strong>{roles.length}</strong>
          </div>
        </section>

        <section className="token-panel panel">
          <TokenClock expiresIn={remaining} ratio={ratio} />
          <div className="claim-list">
            <div>
              <span>SUB</span>
              <code>{claims?.sub?.slice(0, 18) ?? "—"}</code>
            </div>
            <div>
              <span>JTI</span>
              <code>{claims?.jti?.slice(0, 18) ?? "—"}</code>
            </div>
            <div>
              <span>ISSUED</span>
              <code>
                {claims?.iat
                  ? new Date(claims.iat * 1000).toLocaleTimeString("th-TH")
                  : "—"}
              </code>
            </div>
          </div>
          <p className="token-note">
            แสดงเฉพาะ claims ที่ decode จาก browser โดยไม่ถือว่าเป็นผลการ verify
            signature
          </p>
        </section>

        <PermissionInspector session={session} catalog={permissions} />
      </div>
    </main>
  );
}

export function App() {
  const [token, setToken] = useState<string | null>(null);
  const [session, setSession] = useState<SessionContext | null>(null);
  const [permissions, setPermissions] = useState<PermissionDefinition[]>([]);
  const [roles, setRoles] = useState<RoleDefinition[]>([]);
  const [diagnostics, setDiagnostics] = useState<RequestDiagnostic[]>([]);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [probeResult, setProbeResult] = useState<
    "idle" | "running" | "passed" | "failed"
  >("idle");
  const restorationStarted = useRef(false);

  const pushDiagnostic = useCallback((item: RequestDiagnostic) => {
    setDiagnostics((current) => [item, ...current].slice(0, 8));
  }, []);
  const api = useMemo(
    () => createApiClient(API_BASE_URL, pushDiagnostic),
    [pushDiagnostic],
  );

  const clearSession = useCallback(() => {
    sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    setToken(null);
    setSession(null);
    setPermissions([]);
    setRoles([]);
  }, []);

  const loadProtectedContext = useCallback(
    async (accessToken: string) => {
      const [sessionResponse, permissionResponse, roleResponse] =
        await Promise.all([
          api.session(accessToken),
          api.permissions(accessToken),
          api.roles(accessToken),
        ]);
      setSession(sessionResponse.session);
      setPermissions(permissionResponse.data);
      setRoles(roleResponse.data);
    },
    [api],
  );

  useEffect(() => {
    if (restorationStarted.current) return;
    restorationStarted.current = true;
    const storedToken = sessionStorage.getItem(TOKEN_STORAGE_KEY);
    if (!storedToken) {
      setRestoring(false);
      return;
    }
    setToken(storedToken);
    void loadProtectedContext(storedToken)
      .catch((cause: unknown) => {
        clearSession();
        if (cause instanceof ApiError && cause.status !== 401) setError(cause);
      })
      .finally(() => setRestoring(false));
  }, [clearSession, loadProtectedContext]);

  async function login(email: string, password: string) {
    setLoading(true);
    setError(null);
    try {
      const response = await api.login(email, password);
      sessionStorage.setItem(TOKEN_STORAGE_KEY, response.accessToken);
      setToken(response.accessToken);
      setSession(response.session);
      const [permissionResponse, roleResponse] = await Promise.all([
        api.permissions(response.accessToken),
        api.roles(response.accessToken),
      ]);
      setPermissions(permissionResponse.data);
      setRoles(roleResponse.data);
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause
          : new ApiError(0, "UNKNOWN_ERROR", "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ"),
      );
    } finally {
      setLoading(false);
    }
  }

  async function refresh() {
    if (!token) return;
    setRefreshing(true);
    setError(null);
    try {
      await loadProtectedContext(token);
    } catch (cause) {
      const apiError =
        cause instanceof ApiError
          ? cause
          : new ApiError(0, "UNKNOWN_ERROR", "ตรวจ session ไม่สำเร็จ");
      setError(apiError);
      if (apiError.status === 401 || apiError.status === 403) clearSession();
    } finally {
      setRefreshing(false);
    }
  }

  async function logout() {
    if (token) await api.logout(token).catch(() => undefined);
    clearSession();
    setError(null);
  }

  async function probe() {
    setProbeResult("running");
    setError(null);
    try {
      await api.probeAuthentication();
      setProbeResult("failed");
    } catch (cause) {
      if (
        cause instanceof ApiError &&
        cause.status === 401 &&
        cause.code === "AUTHENTICATION_REQUIRED"
      )
        setProbeResult("passed");
      else {
        setProbeResult("failed");
        setError(
          cause instanceof ApiError
            ? cause
            : new ApiError(0, "PROBE_FAILED", "ตรวจ API ไม่สำเร็จ"),
        );
      }
    }
  }

  const signedIn = Boolean(token && session);
  return (
    <div className="app-shell">
      <CredentialRail signedIn={signedIn} />
      <div className="workspace">
        {signedIn && token && session ? (
          <Dashboard
            session={session}
            token={token}
            permissions={permissions}
            roles={roles}
            error={error}
            refreshing={refreshing}
            onRefresh={refresh}
            onLogout={logout}
            onDismissError={() => setError(null)}
          />
        ) : (
          <LoginPanel
            loading={loading}
            restoring={restoring}
            error={error}
            probeResult={probeResult}
            onLogin={login}
            onProbe={probe}
            onDismissError={() => setError(null)}
          />
        )}
        <Diagnostics items={diagnostics} />
      </div>
    </div>
  );
}

import type {
  ApiErrorBody,
  LoginResponse,
  PermissionDefinition,
  RequestDiagnostic,
  RoleDefinition,
  SessionContext,
} from "./types";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields?: Record<string, string>,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type DiagnosticListener = (diagnostic: RequestDiagnostic) => void;
let diagnosticSequence = 0;

export function createApiClient(
  baseUrl: string,
  onDiagnostic: DiagnosticListener,
) {
  const normalizedBaseUrl = baseUrl.replace(/\/$/, "");

  async function request<T>(
    path: string,
    init: RequestInit = {},
    token?: string,
  ): Promise<T> {
    const startedAt = performance.now();
    const method = init.method ?? "GET";
    let response: Response;
    try {
      response = await fetch(`${normalizedBaseUrl}${path}`, {
        ...init,
        headers: {
          Accept: "application/json",
          ...(init.body ? { "Content-Type": "application/json" } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...init.headers,
        },
      });
    } catch {
      onDiagnostic({
        id: ++diagnosticSequence,
        method,
        path,
        status: null,
        statusText: "Network error",
        durationMs: Math.round(performance.now() - startedAt),
        requestId: null,
        occurredAt: new Date().toISOString(),
        outcome: "network",
      });
      throw new ApiError(
        0,
        "NETWORK_ERROR",
        "เชื่อมต่อ API ไม่สำเร็จ ตรวจสอบ URL และสถานะ backend",
      );
    }

    const requestId = response.headers.get("x-request-id");
    onDiagnostic({
      id: ++diagnosticSequence,
      method,
      path,
      status: response.status,
      statusText: response.statusText,
      durationMs: Math.round(performance.now() - startedAt),
      requestId,
      occurredAt: new Date().toISOString(),
      outcome: response.ok ? "success" : "error",
    });

    const text = await response.text();
    let body: T | ApiErrorBody | undefined;
    try {
      body = text ? (JSON.parse(text) as T | ApiErrorBody) : undefined;
    } catch {
      throw new ApiError(
        response.status,
        "INVALID_RESPONSE",
        "API ตอบกลับด้วยข้อมูลที่ไม่ใช่ JSON ตาม contract",
        undefined,
        requestId ?? undefined,
      );
    }
    if (!response.ok) {
      const error = (body as ApiErrorBody | undefined)?.error;
      throw new ApiError(
        response.status,
        error?.code ?? "HTTP_ERROR",
        error?.message ?? `Request failed with status ${response.status}.`,
        error?.fields,
        error?.requestId ?? requestId ?? undefined,
      );
    }
    return body as T;
  }

  return {
    login: (email: string, password: string) =>
      request<LoginResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      }),
    session: (token: string) =>
      request<{ session: SessionContext }>("/auth/me", {}, token),
    logout: (token: string) =>
      request<void>("/auth/logout", { method: "POST" }, token),
    permissions: (token: string) =>
      request<{ data: PermissionDefinition[] }>("/permissions", {}, token),
    roles: (token: string) =>
      request<{ data: RoleDefinition[] }>("/roles", {}, token),
    probeAuthentication: () => request<{ session: SessionContext }>("/auth/me"),
  };
}

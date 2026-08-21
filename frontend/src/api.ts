import type {
  ApiErrorBody,
  AssetDetail,
  AssetInput,
  AssetSummary,
  AssetUnit,
  ConfirmDeliveryInput,
  CreateReservationInput,
  CreateReturnInput,
  EmailTemplate,
  EmailTemplateInput,
  EmailTemplatePreview,
  EmailTemplateSituation,
  ListResponse,
  ManagementArea,
  NotificationSettings,
  NotificationSettingsInput,
  PermissionDefinition,
  PermissionKey,
  Role,
  ReservationDetail,
  ReservationSummary,
  ReturnDecisionInput,
  ReturnDetail,
  SessionContext,
  UpdateSelfInput,
  UserDetail,
  UserListItem,
} from "./types";

const TOKEN_KEY = "asset-rail.access-token";
const API_ROOT = "/api/v1";

export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields: Record<string, string> = {},
    readonly requestId?: string,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

export function getAccessToken() {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function setAccessToken(token: string | null) {
  if (token) sessionStorage.setItem(TOKEN_KEY, token);
  else sessionStorage.removeItem(TOKEN_KEY);
}

function queryString(
  values: Record<string, string | number | boolean | undefined>,
) {
  const query = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== "") query.set(key, String(value));
  });
  const text = query.toString();
  return text ? `?${text}` : "";
}

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  const token = getAccessToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_ROOT}${path}`, { ...init, headers });
  if (response.status === 204) return undefined as T;

  const body = (await response.json().catch(() => null)) as
    ApiErrorBody | T | null;
  if (!response.ok) {
    const errorBody = body as ApiErrorBody | null;
    const detail = errorBody?.error;
    if (response.status === 401 && token) {
      window.dispatchEvent(new Event("asset-rail:unauthorized"));
    }
    throw new ApiClientError(
      response.status,
      detail?.code ?? "REQUEST_FAILED",
      detail?.message ?? "Unable to connect to the system",
      detail?.fields,
      detail?.requestId ?? response.headers.get("X-Request-Id") ?? undefined,
    );
  }
  return body as T;
}

const json = (value: unknown) => JSON.stringify(value);

export const api = {
  login: (username: string, password: string) =>
    request<{
      accessToken: string;
      tokenType: "Bearer";
      expiresIn: number;
      session: SessionContext;
    }>("/auth/login", {
      method: "POST",
      body: json({ username, password }),
    }),
  session: () => request<{ session: SessionContext }>("/bff/session"),
  logout: () => request<void>("/auth/logout", { method: "POST" }),
  // Authenticated, so neither can be a plain <a href> (no way to attach
  // the Bearer token to a browser-initiated navigation) -- fetch the
  // consent URL first, then the caller navigates the browser there itself.
  googleConnectUrl: () => request<{ url: string }>("/auth/google/connect"),
  microsoftConnectUrl: () => request<{ url: string }>("/auth/microsoft/connect"),

  updateMe: (input: UpdateSelfInput) =>
    request<UserDetail>("/users/me", { method: "PATCH", body: json(input) }),
  changeMyPassword: (currentPassword: string, newPassword: string) =>
    request<void>("/users/me/password", {
      method: "POST",
      body: json({ currentPassword, newPassword }),
    }),

  permissions: () => request<{ data: PermissionDefinition[] }>("/permissions"),
  roles: () => request<{ data: Role[] }>("/roles"),
  createRole: (input: {
    name: string;
    description?: string | null;
    permissions: PermissionKey[];
  }) =>
    request<Role>("/roles", { method: "POST", body: json(input) }),
  updateRole: (
    roleId: string,
    input: {
      description?: string | null;
      permissions?: PermissionKey[];
      expectedUpdatedAt: string;
    },
  ) =>
    request<Role>(`/roles/${roleId}`, { method: "PATCH", body: json(input) }),

  users: (filters: {
    search?: string;
    isActive?: boolean;
    roleId?: string;
    areaId?: string;
    cursor?: string;
    limit?: number;
  }) => request<ListResponse<UserListItem>>(`/users${queryString(filters)}`),
  user: (userId: string) => request<UserDetail>(`/users/${userId}`),
  createUser: (input: { username: string; password: string }) =>
    request<UserDetail>("/users", { method: "POST", body: json(input) }),
  updateUserStatus: (
    userId: string,
    input: { isActive: boolean; expectedUpdatedAt: string },
  ) =>
    request<UserDetail>(`/users/${userId}/status`, {
      method: "PATCH",
      body: json(input),
    }),
  assignRole: (
    userId: string,
    input: { roleId: string; managementAreaId: string | null },
  ) =>
    request(`/users/${userId}/role-assignments`, {
      method: "POST",
      body: json(input),
    }),
  removeRole: (userId: string, assignmentId: string) =>
    request<void>(`/users/${userId}/role-assignments/${assignmentId}`, {
      method: "DELETE",
    }),

  areas: (search = "") =>
    request<ListResponse<ManagementArea>>(
      `/management-areas${queryString({ search, limit: 100 })}`,
    ),
  createArea: (input: { name: string; description?: string }) =>
    request<ManagementArea>("/management-areas", {
      method: "POST",
      body: json(input),
    }),
  updateArea: (id: string, input: { name?: string; description?: string }) =>
    request<ManagementArea>(`/management-areas/${id}`, {
      method: "PATCH",
      body: json(input),
    }),
  deleteArea: (id: string) =>
    request<{ success: boolean; id: string }>(`/management-areas/${id}`, {
      method: "DELETE",
    }),
  notificationSettings: () =>
    request<NotificationSettings>("/notification-settings"),
  updateNotificationSettings: (input: NotificationSettingsInput) =>
    request<NotificationSettings>("/notification-settings", {
      method: "PATCH",
      body: json(input),
    }),
  sendTestNotification: () =>
    request<void>("/notification-settings/test", { method: "POST" }),
  emailTemplates: () => request<EmailTemplate[]>("/email-templates"),
  emailTemplate: (situation: EmailTemplateSituation) =>
    request<EmailTemplate>(`/email-templates/${situation}`),
  updateEmailTemplate: (situation: EmailTemplateSituation, input: EmailTemplateInput) =>
    request<EmailTemplate>(`/email-templates/${situation}`, {
      method: "PATCH",
      body: json(input),
    }),
  resetEmailTemplate: (situation: EmailTemplateSituation) =>
    request<EmailTemplate>(`/email-templates/${situation}`, { method: "DELETE" }),
  previewEmailTemplate: (situation: EmailTemplateSituation, input: EmailTemplateInput) =>
    request<EmailTemplatePreview>(`/email-templates/${situation}/preview`, {
      method: "POST",
      body: json(input),
    }),
  assets: (filters: {
    search?: string;
    areaId?: string;
    isActive?: boolean;
    from?: string;
    to?: string;
    cursor?: string;
    limit?: number;
  }) => request<ListResponse<AssetSummary>>(`/assets${queryString(filters)}`),
  asset: (assetId: string) => request<AssetDetail>(`/assets/${assetId}`),
  createAsset: (input: AssetInput) =>
    request<AssetSummary>("/assets", { method: "POST", body: json(input) }),
  createAssets: (items: AssetInput[], description?: string) =>
    request<{ data: AssetSummary[] }>("/assets/batch", {
      method: "POST",
      body: json({ items, description }),
    }),
  updateAsset: (
    assetId: string,
    input: Omit<Partial<AssetInput>, "isActive"> & {
      expectedUpdatedAt: string;
    },
  ) =>
    request<AssetSummary>(`/assets/${assetId}`, {
      method: "PATCH",
      body: json(input),
    }),
  updateAssetStatus: (
    assetId: string,
    status: "ACTIVE" | "INACTIVE",
    expectedUpdatedAt: string,
  ) =>
    request<AssetSummary>(`/assets/${assetId}/status`, {
      method: "PATCH",
      body: json({ status, expectedUpdatedAt }),
    }),
  deactivateAssets: (
    items: Array<{ assetId: string; expectedUpdatedAt: string }>,
  ) =>
    request<{ data: Array<{ id: string; status: "INACTIVE" }> }>(
      "/assets/batch-remove",
      {
        method: "POST",
        body: json({ items }),
      },
    ),
  registerAssetUnits: (
    assetId: string,
    serialNumbers: string[],
    reason?: string,
  ) =>
    request<{ data: AssetUnit[] }>(`/assets/${assetId}/units`, {
      method: "POST",
      body: json({ serialNumbers, reason }),
    }),
  retireAssetUnits: (
    items: Array<{ assetUnitId: string; expectedUpdatedAt: string }>,
    reason?: string,
  ) =>
    request<{ data: AssetUnit[] }>("/assets/units/batch-retire", {
      method: "POST",
      body: json({ items, reason }),
    }),
  assetUnits: (assetId: string, filters: { status?: string; limit?: number }) =>
    request<ListResponse<AssetUnit>>(
      `/assets/${assetId}/units${queryString(filters)}`,
    ),
  createReservation: (input: CreateReservationInput) =>
    request<ReservationDetail>("/reservations", {
      method: "POST",
      body: json(input),
    }),
  reservations: (filters: {
    view?: "MINE" | "PARTICIPATING" | "APPROVALS" | "APPROVAL_HISTORY" | "ALL";
    status?: string;
    areaId?: string;
    search?: string;
    from?: string;
    to?: string;
    cursor?: string;
    limit?: number;
  }) =>
    request<ListResponse<ReservationSummary>>(
      `/reservations${queryString(filters)}`,
    ),
  reservation: (reservationId: string) =>
    request<ReservationDetail>(`/reservations/${reservationId}`),
  submitReservation: (reservationId: string, expectedUpdatedAt: string) =>
    request<ReservationDetail>(`/reservations/${reservationId}/submit`, {
      method: "POST",
      body: json({ expectedUpdatedAt }),
    }),
  decideReservationItem: (
    reservationId: string,
    itemId: string,
    decision: "APPROVE" | "REJECT",
    comment?: string,
  ) =>
    request<ReservationDetail>(
      `/reservations/${reservationId}/items/${itemId}/decision`,
      {
        method: "POST",
        body: json({ decision, ...(comment ? { comment } : {}) }),
      },
    ),
  prepareReservationItem: (
    reservationId: string,
    itemId: string,
    assetUnitIds: string[],
  ) =>
    request<ReservationDetail>(
      `/reservations/${reservationId}/items/${itemId}/prepare`,
      {
        method: "POST",
        body: json({ assetUnitIds }),
      },
    ),
  decideReservationItems: (
    reservationId: string,
    itemIds: string[],
    decision: "APPROVE" | "REJECT",
    comment?: string,
  ) =>
    request<ReservationDetail>(
      `/reservations/${reservationId}/items/decision`,
      {
        method: "POST",
        body: json({ itemIds, decision, ...(comment ? { comment } : {}) }),
      },
    ),
  cancelReservation: (reservationId: string, reason?: string) =>
    request<ReservationDetail>(`/reservations/${reservationId}/cancel`, {
      method: "POST",
      body: json({ ...(reason ? { reason } : {}) }),
    }),
  confirmDelivery: (
    reservationId: string,
    input?: ConfirmDeliveryInput | string[],
  ) => {
    const payload = Array.isArray(input) ? { itemIds: input } : input;
    return request<ReservationDetail>(
      `/reservations/${reservationId}/delivery-confirm`,
      {
        method: "POST",
        ...(payload ? { body: json(payload) } : {}),
      },
    );
  },
  createReturn: (reservationId: string, input: CreateReturnInput) =>
    request<ReturnDetail>(`/reservations/${reservationId}/returns`, {
      method: "POST",
      body: json(input),
    }),
  decideReturn: (
    reservationId: string,
    returnId: string,
    input: ReturnDecisionInput,
  ) =>
    request<ReturnDetail>(
      `/reservations/${reservationId}/returns/${returnId}/decision`,
      {
        method: "POST",
        body: json(input),
      },
    ),
  returns: (filters: {
    view?: "MINE" | "APPROVALS" | "ALL";
    status?: string;
    areaId?: string;
    reservationId?: string;
    search?: string;
    cursor?: string;
    limit?: number;
  }) =>
    request<ListResponse<ReturnDetail>>(`/returns${queryString(filters)}`),
  returnDetail: (returnId: string) =>
    request<ReturnDetail>(`/returns/${returnId}`),
  uploadImage: (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return request<{ url: string }>("/uploads/image", {
      method: "POST",
      body: formData,
    });
  },
};

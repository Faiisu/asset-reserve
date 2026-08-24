export type PermissionKey =
  | "asset:create"
  | "asset:view"
  | "asset:update"
  | "asset:delete"
  | "reservation:create"
  | "reservation:view"
  | "reservation:update"
  | "reservation:approve"
  | "reservation:reject"
  | "return:approve"
  | "user:create"
  | "user:disable"
  | "role:assign";

export type RoleName = string;

export type ManagementAreaRef = { id: string; name: string };

export type SessionContext = {
  user: {
    id: string;
    username: string;
    email: string | null;
    isActive: true;
    profile: {
      name: string;
      phoneNumber: string | null;
      profilePictureUrl: string | null;
    } | null;
    linkedProviders: string[];
    accountLinkRequired: boolean;
  };
  roles: Array<{
    assignmentId: string;
    id: string;
    name: RoleName;
    permissions: PermissionKey[];
    managementArea: ManagementAreaRef | null;
  }>;
  effectivePermissions: {
    global: PermissionKey[];
    byManagementArea: Array<{
      managementAreaId: string;
      permissions: PermissionKey[];
    }>;
  };
};

export type PageInfo = { nextCursor: string | null; hasNextPage: boolean };
export type ListResponse<T> = { data: T[]; pageInfo: PageInfo };

export type PermissionDefinition = {
  key: PermissionKey;
  resource: string;
  action: string;
  description: string;
};

export type Role = {
  id: string;
  name: RoleName;
  description: string | null;
  permissions: PermissionKey[];
  createdAt: string;
  updatedAt: string;
};

export type ManagementArea = ManagementAreaRef & {
  description: string | null;
  createdAt: string;
  updatedAt: string;
};

export type NotificationSettings = {
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  fromName: string;
  fromEmail: string;
  smtpPasswordSet: boolean;
  updatedAt: string | null;
};

export type NotificationSettingsInput = {
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  fromName: string;
  fromEmail: string;
  smtpPassword?: string;
};

export type UserListItem = {
  id: string;
  username: string;
  email: string | null;
  name: string | null;
  isActive: boolean;
  roleCount: number;
  roles: Array<{ id: string; name: RoleName }>;
  createdAt: string;
  updatedAt: string;
};

/** Minimal identity for picking reservation participants (GET /users/directory). */
export type UserDirectoryEntry = {
  id: string;
  email: string | null;
  name: string | null;
  profilePictureUrl: string | null;
};

export type RoleAssignment = {
  id: string;
  userId: string;
  role: { id: string; name: RoleName };
  managementArea: ManagementAreaRef | null;
  assignedBy: { id: string; name: string | null } | null;
  createdAt: string;
};

export type EmailTemplateSituation =
  "reservation_submitted" | "reservation_decided" | "return_decided";

export type EmailTemplate = {
  situation: EmailTemplateSituation;
  label: string;
  description: string;
  recipient: string;
  placeholders: string[];
  subject: string;
  bodyMarkdown: string;
  isCustomized: boolean;
  updatedBy: string | null;
  updatedAt: string | null;
};

export type EmailTemplateInput = {
  subject: string;
  bodyMarkdown: string;
};

export type EmailTemplatePreview = {
  subject: string;
  html: string;
};

export type UpdateSelfInput = {
  name?: string;
  email?: string;
};

export type UserDetail = {
  id: string;
  username: string;
  email: string | null;
  isActive: boolean;
  profile: {
    name: string;
    phoneNumber: string | null;
    profilePictureUrl: string | null;
  } | null;
  authProviders: string[];
  roleAssignments: RoleAssignment[];
  createdAt: string;
  updatedAt: string;
};

export type AssetCapabilities = {
  canEdit: boolean;
  canDeactivate: boolean;
  canManageUnits: boolean;
};

export type AssetSummary = {
  id: string;
  name: string;
  description: string | null;
  pictureUrl: string | null;
  totalQuantity: number;
  allocatedQuantity: number;
  availableQuantity: number;
  isActive: boolean;
  partNumber: string | null;
  unitCounts: {
    total: number;
    active: number;
    reserved: number;
    checkedOut: number;
    broken: number;
    lost: number;
    inRepair: number;
    inactive: number;
  };
  managementArea: ManagementAreaRef;
  owner: {
    id: string;
    email: string | null;
    name: string | null;
    profilePictureUrl: string | null;
  } | null;
  capabilities: AssetCapabilities;
  createdAt: string;
  updatedAt: string;
};

export type AssetUnitEventPerformer = {
  id: string;
  email: string | null;
  name: string | null;
  profilePictureUrl: string | null;
};

export type AssetUnitLedgerEntry = {
  id: string;
  batchId: string;
  assetUnitId: string;
  serialNumber: string;
  eventType: string;
  fromStatus: string | null;
  toStatus: string | null;
  reason: string | null;
  createdAt: string;
  batchDescription: string | null;
  performedBy: AssetUnitEventPerformer;
};

export type AssetDetail = AssetSummary & {
  editPolicy: { permission: "asset:update"; roles: RoleName[] };
  activeReservationItems: Array<{
    id: string;
    quantity: number;
    status: "PREPARED" | "DELIVERED";
    reservation: {
      id: string;
      eventName: string;
      status: string;
      startAt: string;
      endAt: string;
    };
  }>;
  units: AssetUnit[];
  unitEventLedger: AssetUnitLedgerEntry[];
};

export type AssetUnit = {
  id: string;
  serialNumber: string;
  status: string;
  /** Present on schedule-aware backend responses; absent during rolling deploys. */
  hasActiveAssignment?: boolean;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AssetReservationCount = {
  assetId: string;
  name: string;
  partNumber: string | null;
  managementArea: ManagementAreaRef;
  approvedCount: number;
  rejectedCount: number;
  activeUnitCount: number;
  utilizationPercent: number | null;
};

export type ReservationsByAssetResponse = {
  periodStart: string;
  periodEnd: string;
  data: AssetReservationCount[];
};

export type AssetInput = {
  name: string;
  managementAreaId: string;
  partNumber?: string | null;
  description?: string | null;
  pictureUrl?: string | null;
  isActive?: boolean;
};

// Kept in sync with docs/software_spec/lifecycle-and-state-machines.md §2 --
// that table is the single source of truth for accepted values. `ACTIVE`,
// `RETURN`, and bare `PENDING` are explicitly called out there as retired
// aliases the system no longer supports; don't reintroduce them.
export type ReservationStatus =
  | "DRAFT"
  | "PENDING_APPROVAL"
  | "PARTIALLY_APPROVED"
  | "APPROVED"
  | "DELIVERY_CONFIRMED"
  | "RETURN_PENDING"
  | "COMPLETED"
  | "REJECTED"
  | "CANCELLED";

// Per docs §3: approval now assigns serial units in the same step, so items
// go PENDING -> PREPARED directly (no APPROVED resting state); CHECKED_OUT
// is a ReservationItemUnit status, not a ReservationItem one.
// CANCELLED = every assigned serial was cancelled at handover (§7.8), so
// nothing left the store room and there is nothing to return.
export type ReservationItemStatus =
  "PENDING" | "PREPARED" | "REJECTED" | "DELIVERED" | "RETURNED" | "CANCELLED";

export type ReservationUser = {
  id: string;
  email: string | null;
  name: string | null;
  profilePictureUrl: string | null;
};

export type ReservationItemInput = {
  assetId: string;
  quantity: number;
};

export type ConfirmDeliveryInput = {
  items: Array<{
    reservationItemId: string;
    reservationItemUnitIds?: string[];
    cancelledReservationItemUnitIds?: string[];
  }>;
};

export type ReservationDetail = {
  id: string;
  eventName: string;
  description: string | null;
  startAt: string;
  endAt: string;
  status: ReservationStatus;
  requester: ReservationUser;
  participants: ReservationUser[];
  items: Array<{
    id: string;
    quantity: number;
    status: ReservationItemStatus;
    asset: {
      id: string;
      name: string;
      description: string | null;
      pictureUrl: string | null;
      isActive: boolean;
      managementArea: ManagementAreaRef;
    };
    units: Array<{
      id: string;
      assetUnitId: string;
      serialNumber: string;
      status: string;
      assignmentStartAt?: string;
      assignmentEndAt?: string;
    }>;
    returnSummary?: {
      totalUnits: number;
      returnedGoodCount: number;
      returnedBrokenCount: number;
      returnedLostCount: number;
      pendingReturnCount: number;
      remainingReturnQuantity: number;
    };
    approval: {
      id: string;
      status: "PENDING" | "APPROVED" | "REJECTED";
      comment: string | null;
      decidedAt: string | null;
      approver: ReservationUser;
    } | null;
    availability: {
      assetId: string;
      totalQuantity: number;
      approvedQuantity: number;
      pendingQuantity: number;
      availableQuantity: number;
      pendingReservationCount: number;
    };
    warnings: Array<{
      code: "PENDING_RESERVATION_OVERLAP";
      message: string;
      pendingQuantity: number;
      pendingReservationCount: number;
    }>;
    capabilities: {
      canApprove: boolean;
      canReject: boolean;
      canConfirmDelivery?: boolean;
      canReturn?: boolean;
    };
  }>;
  returns: ReturnDetail[];
  activityLogs?: ActivityLog[];
  capabilities: {
    canSubmit: boolean;
    canConfirmDelivery?: boolean;
    canCancel?: boolean;
    canReturn?: boolean;
    canDecideReturn?: boolean;
  };
  createdAt: string;
  updatedAt: string;
};

export type ActivityLog = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  details: Record<string, any> | null;
  actor: ReservationUser;
  createdAt: string;
};

export type ReturnItemUnitCondition = "GOOD" | "BROKEN" | "LOST";

export type ReturnItemUnitDetail = {
  id: string;
  returnItemId: string;
  reservationItemUnitId: string;
  assetUnitId: string;
  serialNumber: string;
  condition: ReturnItemUnitCondition | null;
  pictureUrl: string | null;
  note: string | null;
  createdAt: string;
};

export type ReturnItemDetail = {
  id: string;
  returnId: string;
  reservationItemId: string;
  assetId: string;
  assetName: string;
  managementArea: ManagementAreaRef;
  description: string | null;
  pictureUrl: string | null;
  units: ReturnItemUnitDetail[];
  createdAt: string;
};

export type ReturnDetail = {
  id: string;
  reservationId: string;
  status: "PENDING" | "REJECTED" | "COMPLETED";
  note: string | null;
  returnedAt: string | null;
  returnedBy: string;
  returner: ReservationUser;
  reservation?: {
    id: string;
    eventName: string;
    requester: ReservationUser;
  };
  items: ReturnItemDetail[];
  approval: {
    id: string;
    status: "PENDING" | "APPROVED" | "REJECTED";
    description: string | null;
    decidedAt: string | null;
    approver: ReservationUser;
  } | null;
  capabilities: {
    canApprove: boolean;
    canReject: boolean;
  };
  createdAt: string;
  updatedAt: string;
};

export type CreateReturnItemInput = {
  reservationItemId: string;
  reservationItemUnitIds: string[];
  description?: string | null;
};

export type CreateReturnInput = {
  items: CreateReturnItemInput[];
  note?: string | null;
};

export type DecideReturnItemUnitInput = {
  reservationItemUnitId: string;
  condition: ReturnItemUnitCondition;
};

export type DecideReturnItemInput = {
  reservationItemId: string;
  units?: DecideReturnItemUnitInput[];
  description?: string | null;
};

export type ReturnDecisionInput = {
  decision: "APPROVE" | "REJECT";
  items?: DecideReturnItemInput[];
  description?: string | null;
};

export type CreateReservationInput = {
  eventName: string;
  description?: string | null;
  startAt: string;
  endAt: string;
  status?: "DRAFT" | "PENDING_APPROVAL";
  items: ReservationItemInput[];
  participantIds?: string[];
};

export type ReservationSummary = {
  id: string;
  eventName: string;
  description: string | null;
  startAt: string;
  endAt: string;
  status: ReservationStatus;
  requester: ReservationUser;
  managementAreas: ManagementAreaRef[];
  itemCount: number;
  totalQuantity: number;
  pendingItemCount: number;
  approvedItemCount: number;
  rejectedItemCount: number;
  pendingDecisionCount: number;
  capabilities: {
    canSubmit: boolean;
    canReview: boolean;
    canConfirmDelivery?: boolean;
    canCancel?: boolean;
  };
  createdAt: string;
  updatedAt: string;
};

export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
    fields?: Record<string, string>;
    requestId?: string;
  };
};

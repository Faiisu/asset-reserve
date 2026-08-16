export type PermissionKey =
  | "asset:create"
  | "asset:view"
  | "asset:update"
  | "asset:delete"
  | "reservation:create"
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
    email: string;
    isActive: true;
    profile: {
      name: string;
      phoneNumber: string | null;
      profilePictureUrl: string | null;
    } | null;
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

export type UserListItem = {
  id: string;
  email: string;
  name: string | null;
  isActive: boolean;
  roleCount: number;
  roles: Array<{ id: string; name: RoleName }>;
  createdAt: string;
  updatedAt: string;
};

export type RoleAssignment = {
  id: string;
  userId: string;
  role: { id: string; name: RoleName };
  managementArea: ManagementAreaRef | null;
  assignedBy: { id: string; name: string | null } | null;
  createdAt: string;
};

export type UserDetail = {
  id: string;
  email: string;
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

export type AssetTemplate = {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AssetCapabilities = {
  canEdit: boolean;
  canDeactivate: boolean;
  canAdjustQuantity: boolean;
};

export type AssetStatus = "ACTIVE" | "BROKEN" | "LOST" | "INACTIVE";

export type AssetSummary = {
  id: string;
  name: string;
  description: string | null;
  pictureUrl: string | null;
  totalQuantity: number;
  allocatedQuantity: number;
  availableQuantity: number;
  isActive: boolean;
  status: AssetStatus;
  assetTemplate: {
    id: string;
    name: string;
    description: string | null;
  } | null;
  managementArea: ManagementAreaRef;
  owner: {
    id: string;
    email: string;
    name: string | null;
    profilePictureUrl: string | null;
  } | null;
  capabilities: AssetCapabilities;
  createdAt: string;
  updatedAt: string;
};

export type AssetDetail = AssetSummary & {
  editPolicy: { permission: "asset:update"; roles: RoleName[] };
  activeReservationItems: Array<{
    id: string;
    quantity: number;
    status: "APPROVED" | "PREPARED" | "CHECKED_OUT";
    reservation: {
      id: string;
      eventName: string;
      status: string;
      startAt: string;
      endAt: string;
    };
  }>;
  inventoryLedger: Array<{
    id: string;
    batchId: string;
    transactionType: string;
    quantityDelta: number;
    reason: string | null;
    createdAt: string;
    batchDescription: string | null;
    performedBy: {
      id: string;
      email: string;
      name: string | null;
      profilePictureUrl: string | null;
    };
  }>;
};

export type AssetInput = {
  name: string;
  managementAreaId: string;
  assetTemplateId?: string | null;
  description?: string | null;
  pictureUrl?: string | null;
  totalQuantity: number;
  isActive?: boolean;
};

export type InventoryResult = {
  id: string;
  operation: "ADD" | "REMOVE";
  description: string | null;
  items: Array<{
    transactionId: string;
    assetId: string;
    assetName: string;
    quantityDelta: number;
    totalQuantity: number;
    reason: string | null;
  }>;
  createdAt: string;
};

export type ReservationStatus =
  | "DRAFT"
  | "PENDING"
  | "PENDING_APPROVAL"
  | "PARTIALLY_APPROVED"
  | "APPROVED"
  | "DELIVERY_CONFIRMED"
  | "ACTIVE"
  | "RETURN"
  | "RETURN_PENDING"
  | "RETURN_CONFIRMED"
  | "COMPLETED"
  | "REJECTED"
  | "CANCELLED";

export type ReservationItemStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "PREPARED"
  | "CHECKED_OUT"
  | "DELIVERED"
  | "RETURNED";

export type ReservationUser = {
  id: string;
  email: string;
  name: string | null;
  profilePictureUrl: string | null;
};

export type ReservationItemInput = {
  assetId: string;
  quantity: number;
};

export type ReservationChangeData = {
  eventName?: string;
  description?: string | null;
  startAt?: string;
  endAt?: string;
  items?: ReservationItemInput[];
  participantIds?: string[];
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
      template: { id: string; name: string } | null;
    };
    returnSummary?: {
      returnedQuantity: number;
      brokenQuantity: number;
      lostQuantity: number;
      lostRecoverableQuantity?: number;
      pendingReturnQuantity: number;
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
  changeRequests: Array<{
    id: string;
    changeData: ReservationChangeData;
    reason: string | null;
    status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
    requestedBy: ReservationUser;
    reviewedBy: ReservationUser | null;
    reviewedAt: string | null;
    createdAt: string;
  }>;
  returns: ReturnDetail[];
  capabilities: {
    canSubmit: boolean;
    canRequestChange: boolean;
    canConfirmDelivery?: boolean;
    canCancel?: boolean;
    canReturn?: boolean;
  };
  createdAt: string;
  updatedAt: string;
};

export type ReturnItemDetail = {
  id: string;
  reservationItemId: string;
  assetId: string;
  assetName: string;
  managementArea: ManagementAreaRef;
  quantityReturned: number;
  quantityBroken: number;
  quantityLost: number;
  description: string | null;
};

export type ReturnDetail = {
  id: string;
  reservationId: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "COMPLETED";
  returnedAt: string | null;
  returnedBy: ReservationUser;
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
  quantityReturned: number;
  quantityBroken?: number;
  quantityLost?: number;
  description?: string | null;
};

export type CreateReturnInput = {
  items: CreateReturnItemInput[];
  note?: string | null;
  immediateApprove?: boolean;
};

export type DecideReturnItemInput = {
  reservationItemId: string;
  quantityReturned?: number;
  quantityBroken?: number;
  quantityLost?: number;
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
  hasPendingChangeRequest: boolean;
  pendingDecisionCount: number;
  capabilities: {
    canSubmit: boolean;
    canRequestChange: boolean;
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

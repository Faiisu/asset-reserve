# Frontend data contracts

[← กลับไปสารบัญ](../README.md)

## Frontend data contracts

API อาจเพิ่ม computed fields ได้ แต่ persisted fields ต้อง map กลับไปยัง Prisma ปัจจุบัน

> **⚠️ Return contract mismatch (live bug, not a doc issue):** the shapes below for `ReturnDto`/`CreateReturnInput`/`ReturnDecisionInput` describe the **correct**, per-serial-unit contract that the real backend DTOs (`backend/src/returns/returns.dto.ts`) actually validate. The current frontend code — `types.ts`, `api.ts`, and `ReservationDetailPage.tsx`'s return handlers — still sends/expects the **old quantity-based shape** (`quantityReturned`/`quantityBroken`/`quantityLost`), which the backend's `forbidNonWhitelisted` validation pipe rejects with `422`. As of this writing, submitting or deciding a return through the UI does not work. The OpenAPI contract's `ReturnItemDetail`/return request schemas are also still quantity-based and need the same fix. This is a real application bug, not just documentation drift — flagged here rather than silently documented as normal.

```ts
type SessionUser = {
  id: string;
  username: string;
  email: string | null;
  isActive: boolean;
  profile: {
    name: string;
    phoneNumber: string | null;
    profilePictureUrl: string | null;
  } | null;
  linkedProviders: string[];
  accountLinkRequired: boolean;
  roles: Array<{
    assignmentId: string;
    id: string;
    name: string;
    permissions: PermissionKey[];
    managementArea: { id: string; name: string } | null;
  }>;
  effectivePermissions: {
    global: PermissionKey[];
    byManagementArea: Array<{ managementAreaId: string; permissions: PermissionKey[] }>;
  };
};

type AssetSummary = {
  id: string;
  name: string;
  description: string | null;
  pictureUrl: string | null;
  totalQuantity: number;
  allocatedQuantity: number;
  availableQuantity: number;
  isActive: boolean;
  managementArea: { id: string; name: string };
  capabilities: { canEdit: boolean; canDeactivate: boolean; canManageUnits: boolean };
  createdAt: string;
  updatedAt: string;
};

// This enum is the correct canonical list (see ReservationStatus.md). Note:
// frontend/src/types.ts:259-272 itself still declares 13 values including
// non-canonical PENDING/ACTIVE/RETURN -- that's a code bug, not a doc error;
// this contract doc is intentionally more correct than the code it describes.
type ReservationDto = {
  id: string;
  eventName: string;
  description: string | null;
  startAt: string;
  endAt: string;
  status:
    | "DRAFT"
    | "PENDING_APPROVAL"
    | "PARTIALLY_APPROVED"
    | "APPROVED"
    | "DELIVERY_CONFIRMED"
    | "RETURN_PENDING"
    | "RETURN_CONFIRMED"
    | "COMPLETED"
    | "REJECTED"
    | "CANCELLED";
  requester: { id: string; email: string | null; name: string | null; profilePictureUrl: string | null }; // ReservationUser
  items: Array<{
    id: string;
    asset: { id: string; name: string; pictureUrl: string | null };
    quantity: number;
    status:
      | "PENDING"
      | "APPROVED"
      | "REJECTED"
      | "PREPARED"
      | "CHECKED_OUT"
      | "DELIVERED"
      | "RETURNED";
    preparedBy: string | null;
    preparedAt: string | null;
    checkedOutBy: string | null;
    checkedOutAt: string | null;
    approval: {
      status: "PENDING" | "APPROVED" | "REJECTED";
      comment: string | null;
      decidedAt: string | null;
    } | null;
  }>;
  capabilities: {
    canSubmit: boolean;
    canRequestChange: boolean;
    canConfirmDelivery?: boolean;
    canCancel?: boolean;
    canReturn?: boolean;
  };
};
```

`canApproveItems`/`canPrepare`/`canCheckOut` ไม่มีจริง — item-level approve/reject ใช้ `item.capabilities: { canApprove, canReject, canConfirmDelivery?, canReturn? }` แยกต่างหากในแต่ละ item ไม่ใช่ capability ระดับ reservation

```ts
// The correct per-unit shape (matches backend/src/returns/returns.dto.ts).
// See the warning above: current frontend code does not send/expect this yet.
type ReturnDto = {
  id: string;
  reservationId: string;
  returnedBy: string; // UUID; separate `returner: ReservationUser` carries the profile
  returner: { id: string; email: string | null; name: string | null; profilePictureUrl: string | null };
  status: "PENDING" | "APPROVED" | "REJECTED" | "COMPLETED";
  returnedAt: string | null;
  items: Array<{
    id: string;
    reservationItemId: string;
    units: Array<{
      reservationItemUnitId: string;
      condition: "GOOD" | "BROKEN" | "LOST" | null; // null until inspected at decision time
    }>;
    description: string | null;
  }>;
  approval: {
    status: "PENDING" | "APPROVED" | "REJECTED";
    description: string | null;
    decidedAt: string | null;
    approver: { id: string; email: string | null; name: string | null; profilePictureUrl: string | null };
  } | null;
};

// POST /reservations/:id/returns
type CreateReturnInput = {
  items: Array<{
    reservationItemId: string;
    reservationItemUnitIds: string[]; // 1-200, unique
    description?: string | null;
  }>;
  immediateApprove?: boolean;
};

// POST /reservations/:id/returns/:returnId/decision
type ReturnDecisionInput = {
  decision: "APPROVE" | "REJECT";
  items?: Array<{
    reservationItemId: string;
    units?: Array<{ reservationItemUnitId: string; condition: "GOOD" | "BROKEN" | "LOST" }>;
    description?: string | null;
  }>;
  description?: string | null;
};
```

วันเวลาจาก API ต้องเป็น ISO 8601 พร้อม timezone และ frontend แปลงตาม timezone ของ browser ใน MVP เพราะยังไม่มี Workspace/Timezone model

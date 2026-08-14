# Frontend data contracts

[← กลับไปสารบัญ](../README.md)

## Frontend data contracts

API อาจเพิ่ม computed fields ได้ แต่ persisted fields ต้อง map กลับไปยัง Prisma ปัจจุบัน

```ts
type SessionUser = {
  id: string;
  email: string;
  isActive: boolean;
  profile: {
    name: string;
    phoneNumber: string | null;
    profilePictureUrl: string | null;
  } | null;
  roles: Array<{
    id: string;
    name: "ADMIN" | "MANAGER" | "USER";
    permissions: string[];
    managementAreaId: string | null;
  }>;
  capabilities: Record<string, boolean>;
};

type AssetSummary = {
  id: string;
  name: string;
  description: string | null;
  pictureUrl: string | null;
  totalQuantity: number;
  availableQuantity: number;
  isActive: boolean;
  assetTemplate: { id: string; name: string } | null;
  managementArea: { id: string; name: string };
  createdAt: string;
  updatedAt: string;
};

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
    | "REJECTED"
    | "CANCELLED"
    | "ACTIVE"
    | "COMPLETED";
  requester: { id: string; name: string; email: string };
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
    canEdit: boolean;
    canSubmit: boolean;
    canCancel: boolean;
    canApproveItems: boolean;
    canPrepare: boolean;
    canCheckOut: boolean;
    canReturn: boolean;
  };
};

type ReturnDto = {
  id: string;
  reservationId: string;
  returnedBy: { id: string; name: string };
  status: "PENDING" | "APPROVED" | "REJECTED" | "COMPLETED";
  returnedAt: string | null;
  items: Array<{
    id: string;
    reservationItemId: string;
    assetName: string;
    quantityReturned: number;
    quantityBroken: number;
    quantityLost: number;
    description: string | null;
  }>;
  approval: {
    status: "PENDING" | "APPROVED" | "REJECTED";
    description: string | null;
    decidedAt: string | null;
  } | null;
};
```

วันเวลาจาก API ต้องเป็น ISO 8601 พร้อม timezone และ frontend แปลงตาม timezone ของ browser ใน MVP เพราะยังไม่มี Workspace/Timezone model

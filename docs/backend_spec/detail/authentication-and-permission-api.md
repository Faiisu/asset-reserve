# Authentication and permission API contract

[← Backend specification](../README.md) · [OpenAPI contract](../contracts/openapi.yaml)

เอกสารนี้เป็น contract สำหรับ frontend, integration client และ backend ใช้พัฒนาแยกกันได้ โดยครอบคลุม password authentication, session context, user administration, role definition และ role assignment ใน MVP

หากตัวอย่างในเอกสารกับ OpenAPI ต่างกัน ให้ยึด OpenAPI เป็น machine-readable contract และเปิด issue เพื่อแก้เอกสารทั้งสองส่วนพร้อมกัน

## Contract status

- Version: `v1`
- Base path: `/api/v1`
- Content type: `application/json`
- Field naming: `camelCase`
- ID: UUID string
- Date/time: ISO 8601 พร้อม timezone
- Authentication: `Authorization: Bearer <accessToken>`
- Access token อายุเริ่มต้น 15 นาที
- OpenAPI source: [`openapi.yaml`](../contracts/openapi.yaml) และไฟล์ย่อยใน [`contracts/`](../contracts/README.md)

ระหว่าง backend ยังไม่เสร็จ ผู้ใช้ API สามารถ import OpenAPI เข้า Prism, Mockoon, Postman หรือเครื่องมือ generate client ได้ โดย mock ต้องรักษา status code และ response shape ตาม contract นี้

## Security model

ระบบใช้ RBAC ร่วมกับ management-area scope:

- `Role.permissions` เก็บ permission keys
- `UserRole.managementAreaId = null` หมายถึง permission มีผลทั้งระบบ
- `UserRole.managementAreaId = UUID` หมายถึง permission มีผลเฉพาะ management area นั้น
- Effective permission ใน area หนึ่งคือ union ของ global permissions และ permissions ที่ผูกกับ area นั้น
- Frontend ใช้ effective permissions เพื่อแสดง UI เท่านั้น Backend ต้องตรวจ user active, permission และ scope ทุก request

Permission catalog ใน MVP:

| Permission            | ความหมาย                           |
| --------------------- | ---------------------------------- |
| `asset:create`        | สร้าง asset ใน scope               |
| `asset:view`          | ดู asset ใน scope                  |
| `asset:update`        | แก้ไข asset ใน scope               |
| `asset:delete`        | deactivate/delete asset ตาม policy |
| `reservation:create`  | สร้าง reservation                  |
| `reservation:update`  | แก้ reservation ที่ policy อนุญาต  |
| `reservation:approve` | อนุมัติ reservation item ใน scope  |
| `reservation:reject`  | ปฏิเสธ reservation item ใน scope   |
| `return:approve`      | ตัดสิน return ใน scope             |
| `user:create`         | สร้างผู้ใช้                        |
| `user:disable`        | activate/deactivate ผู้ใช้         |
| `role:assign`         | เพิ่มหรือถอด role assignment       |

Permission catalog เป็นค่าคงที่ของ application ไม่ใช่ข้อมูลที่ client สร้างเพิ่มเอง ส่วนการเปลี่ยน permissions ภายใน role อนุญาตเฉพาะผู้ที่มี global `ADMIN` assignment เพื่อป้องกัน privilege escalation

ใน `effectivePermissions.byManagementArea[].permissions` backend ต้องคืนค่า union ที่คำนวณแล้ว โดยรวม global permissions ด้วย ไม่ใช่คืนเฉพาะ scoped permissions

## Common request rules

Protected endpoint ต้องส่ง:

```http
Authorization: Bearer eyJ...
Accept: application/json
X-Request-Id: 0192f25f-31a7-7d52-9814-0f0af7f39831
```

`X-Request-Id` เป็น optional หากไม่ส่ง backend ต้องสร้างและคืนค่าใน response header ชื่อเดียวกัน ห้ามใส่ access token, password หรือข้อมูลลับใน URL/query string

List endpoint ใช้ cursor pagination:

```json
{
  "data": [],
  "pageInfo": {
    "nextCursor": null,
    "hasNextPage": false
  }
}
```

- `limit` ค่าเริ่มต้น `20`, ต่ำสุด `1`, สูงสุด `100`
- `cursor` เป็น opaque string ห้าม client แกะหรือสร้างเอง
- การเรียงลำดับต้อง deterministic โดยใช้ `createdAt DESC, id DESC` หาก endpoint ไม่ระบุอย่างอื่น

## Common error contract

ทุก error ตอบรูปแบบเดียวกัน:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request contains invalid fields.",
    "fields": {
      "email": "Must be a valid email address."
    },
    "requestId": "0192f25f-31a7-7d52-9814-0f0af7f39831"
  }
}
```

| HTTP | Code ตัวอย่าง                    | ใช้เมื่อ                                              |
| ---- | -------------------------------- | ----------------------------------------------------- |
| 400  | `INVALID_REQUEST`                | JSON/header/query ไม่ถูกต้อง                          |
| 401  | `INVALID_CREDENTIALS`            | Login ไม่สำเร็จ โดยไม่บอกว่าพบ email หรือไม่          |
| 401  | `AUTHENTICATION_REQUIRED`        | ไม่มี token, token หมดอายุ หรือลายเซ็นไม่ถูกต้อง      |
| 403  | `ACCOUNT_INACTIVE`               | บัญชีถูกปิดใช้งาน                                     |
| 403  | `PERMISSION_DENIED`              | ไม่มี permission หรือ scope                           |
| 404  | `USER_NOT_FOUND`                 | ไม่พบ resource ที่ caller มีสิทธิ์เห็น                |
| 409  | `EMAIL_ALREADY_EXISTS`           | Email ซ้ำ                                             |
| 409  | `ROLE_ASSIGNMENT_ALREADY_EXISTS` | Role และ scope ซ้ำ                                    |
| 409  | `LAST_GLOBAL_ADMIN`              | การเปลี่ยนแปลงจะทำให้ไม่เหลือ global ADMIN ที่ active |
| 409  | `STALE_WRITE`                    | `expectedUpdatedAt` ไม่ตรงกับข้อมูลล่าสุด             |
| 422  | `VALIDATION_ERROR`               | Field ผ่าน JSON parsing แต่ไม่ผ่าน validation         |
| 429  | `RATE_LIMITED`                   | Login หรือ endpoint ถูกเรียกเกินกำหนด                 |

Response 401 ต้องส่ง `WWW-Authenticate: Bearer` ด้วย

## Data shapes

### Session context

```ts
type SessionContext = {
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
    name: "ADMIN" | "MANAGER" | "USER";
    permissions: PermissionKey[];
    managementArea: { id: string; name: string } | null;
  }>;
  effectivePermissions: {
    global: PermissionKey[];
    byManagementArea: Array<{
      managementAreaId: string;
      permissions: PermissionKey[];
    }>;
  };
};
```

Arrays ของ permissions ต้องไม่มีค่าซ้ำและเรียงตามตัวอักษร `roles` เรียงตาม role name แล้ว management-area name เพื่อให้ response และ test คงที่

### User detail

```ts
type UserDetail = {
  id: string;
  email: string;
  isActive: boolean;
  profile: {
    name: string;
    phoneNumber: string | null;
    profilePictureUrl: string | null;
  } | null;
  authProviders: string[];
  roleAssignments: Array<{
    id: string;
    userId: string;
    role: { id: string; name: "ADMIN" | "MANAGER" | "USER" };
    managementArea: { id: string; name: string } | null;
    assignedBy: { id: string; name: string | null } | null;
    createdAt: string;
  }>;
  createdAt: string;
  updatedAt: string;
};
```

`passwordHash` และ external `providerUserId` ห้ามปรากฏใน response ทุกกรณี

## Authentication endpoints

### `POST /auth/login`

Public endpoint สำหรับ password login

Request:

```json
{
  "email": "manager@example.com",
  "password": "correct horse battery staple"
}
```

Validation:

- email required, normalize ด้วย trim และ lowercase ก่อน lookup
- password required, ความยาว input ไม่เกิน 1024 ตัวอักษร
- ห้ามแยก error ระหว่าง email ไม่มีอยู่, password ผิด หรือบัญชี external-only

Response `200`:

```json
{
  "accessToken": "eyJ...",
  "tokenType": "Bearer",
  "expiresIn": 900,
  "session": {
    "user": {
      "id": "6e7fd59f-1499-4f7a-bb47-5d6a09d32650",
      "email": "manager@example.com",
      "isActive": true,
      "profile": {
        "name": "Asset Manager",
        "phoneNumber": null,
        "profilePictureUrl": null
      }
    },
    "roles": [
      {
        "assignmentId": "531f1f56-748b-49f0-b0c4-9ef72a74ae18",
        "id": "4a720a60-e48a-4f14-873a-e4b61ee2a9da",
        "name": "MANAGER",
        "permissions": ["asset:create", "asset:update", "asset:view"],
        "managementArea": {
          "id": "2ab9fa8d-a03a-49eb-a8c3-14d9a5d9664d",
          "name": "Bangkok Office"
        }
      }
    ],
    "effectivePermissions": {
      "global": [],
      "byManagementArea": [
        {
          "managementAreaId": "2ab9fa8d-a03a-49eb-a8c3-14d9a5d9664d",
          "permissions": ["asset:create", "asset:update", "asset:view"]
        }
      ]
    }
  }
}
```

Errors: `401 INVALID_CREDENTIALS`, `403 ACCOUNT_INACTIVE`, `422 VALIDATION_ERROR`, `429 RATE_LIMITED`

### `GET /auth/me`

คืน SessionContext ล่าสุดสำหรับ reusable API client ใช้หลัง reload หรือเมื่อ permission เปลี่ยน

Response `200` เป็น object ที่มี field `session` ตาม `SessionContext` โดยใช้ shape เดียวกับ `session` ใน login response

### `POST /auth/logout`

Response `204` ไม่มี body ในระยะที่ยังไม่มี Session/RefreshToken model endpoint นี้ให้ client ล้าง token เท่านั้น และ access token เดิมยังใช้ได้จนหมดอายุ หากต้องการ revoke ทันทีต้องเพิ่ม persistent session/revocation model ก่อน

### BFF session

`GET /bff/session` ใช้ SessionContext เดียวกับ `GET /auth/me` และอาจเพิ่ม `navigation` หรือ page capabilities ได้ แต่ห้ามเปลี่ยนความหมายของ user, roles และ effective permissions

External identity ที่มีใน Prisma รองรับการเชื่อม provider ในอนาคต แต่ OAuth/OIDC authorize และ callback endpoints ยังอยู่นอก contract ฉบับนี้ ห้าม client คาดเดา endpoint เองจนกว่าจะเพิ่มลง OpenAPI

## Permission and role endpoints

### `GET /permissions`

ผู้ใช้ที่ login แล้วเรียกได้ คืน catalog เพื่อสร้าง role editor โดย client ห้าม hardcode label เป็น source of truth

Response `200`:

```json
{
  "data": [
    {
      "key": "asset:create",
      "resource": "asset",
      "action": "create",
      "description": "Create assets within the permitted scope."
    }
  ]
}
```

### `GET /roles`

ผู้ใช้ที่ login แล้วเรียกได้ ไม่มี pagination เพราะ MVP มี role เพียง 3 รายการ

Response `200`:

```json
{
  "data": [
    {
      "id": "4a720a60-e48a-4f14-873a-e4b61ee2a9da",
      "name": "MANAGER",
      "description": "Manage assets and workflows in assigned areas.",
      "permissions": ["asset:create", "asset:update", "asset:view"],
      "createdAt": "2026-08-15T09:00:00.000Z",
      "updatedAt": "2026-08-15T09:00:00.000Z"
    }
  ]
}
```

### `PATCH /roles/{roleId}`

แก้ description และ permission set ผู้เรียกต้องมี active global `ADMIN` assignment การมี `ADMIN` แบบ area-scoped ไม่เพียงพอ

Request:

```json
{
  "description": "Manage assets and approvals in assigned areas.",
  "permissions": ["asset:create", "asset:update", "asset:view"],
  "expectedUpdatedAt": "2026-08-15T09:00:00.000Z"
}
```

Rules:

- ส่งอย่างน้อยหนึ่ง field ที่แก้ไข
- ทุก permission ต้องอยู่ใน catalog และห้ามซ้ำ
- `name` แก้ผ่าน API ไม่ได้ใน MVP
- ADMIN role ต้องคง permissions `user:disable` และ `role:assign`
- ใช้ `expectedUpdatedAt` ป้องกัน lost update

Response `200` คืน role shape เดียวกับรายการใน `GET /roles`

## User administration endpoints

### `GET /users`

ต้องมีอย่างน้อยหนึ่ง permission จาก `user:create`, `user:disable`, `role:assign`

Query:

| Field      | Type    | Default | รายละเอียด                             |
| ---------- | ------- | ------- | -------------------------------------- |
| `search`   | string  | -       | ค้น email หรือ profile name สูงสุด 100 |
| `isActive` | boolean | -       | กรองสถานะ                              |
| `roleId`   | UUID    | -       | กรองผู้ใช้ที่มี role                   |
| `areaId`   | UUID    | -       | กรอง assignment ใน management area     |
| `cursor`   | string  | -       | cursor จาก response ก่อนหน้า           |
| `limit`    | integer | 20      | 1–100                                  |

Response `200`:

```json
{
  "data": [
    {
      "id": "6e7fd59f-1499-4f7a-bb47-5d6a09d32650",
      "email": "manager@example.com",
      "name": "Asset Manager",
      "isActive": true,
      "roleCount": 1,
      "createdAt": "2026-08-15T09:00:00.000Z",
      "updatedAt": "2026-08-15T09:00:00.000Z"
    }
  ],
  "pageInfo": {
    "nextCursor": null,
    "hasNextPage": false
  }
}
```

### `POST /users`

ต้องมี `user:create` แบบ global ห้ามรับ `passwordHash`, `assignedBy` หรือ ID จาก client

Request:

```json
{
  "email": "new.user@example.com",
  "password": "a-long-initial-password",
  "profile": {
    "name": "New User",
    "phoneNumber": "+66-81-234-5678",
    "profilePictureUrl": null
  }
}
```

Validation:

- email required สูงสุด 255 และ unique แบบ normalized lowercase
- password required สำหรับ password user, 12–128 ตัวอักษร และ hash ด้วย Argon2id
- profile.name required 1–150 ตัวอักษร
- phoneNumber optional สูงสุด 30
- profilePictureUrl optional URL สูงสุด 2048
- การสร้าง external-only user ไม่อยู่ใน endpoint นี้

Response `201` คืน `UserDetail` โดย `roleAssignments` เริ่มเป็น array ว่าง

### `GET /users/{userId}`

ต้องมีอย่างน้อยหนึ่ง permission จาก `user:create`, `user:disable`, `role:assign` Response `200` คืน `UserDetail`

### `PATCH /users/{userId}/status`

ต้องมี global `user:disable`

Request:

```json
{
  "isActive": false,
  "expectedUpdatedAt": "2026-08-15T09:00:00.000Z"
}
```

Response `200` คืน `UserDetail`

Rules:

- ห้ามผู้ใช้ deactivate ตัวเองผ่าน endpoint นี้
- ห้าม deactivate active user คนสุดท้ายที่มี global ADMIN
- token ของผู้ใช้ที่ถูก deactivate อาจยังมีลายเซ็นถูกต้อง แต่ protected endpoint ต้องตรวจ active state ตาม security policy

## Role assignment endpoints

### `POST /users/{userId}/role-assignments`

ต้องมี global `role:assign` เพราะ endpoint นี้เปลี่ยนสิทธิ์ผู้ใช้อื่น `assignedBy` อ่านจาก token ห้ามรับจาก client

Request role แบบ scoped:

```json
{
  "roleId": "4a720a60-e48a-4f14-873a-e4b61ee2a9da",
  "managementAreaId": "2ab9fa8d-a03a-49eb-a8c3-14d9a5d9664d"
}
```

Request role แบบ global:

```json
{
  "roleId": "4a720a60-e48a-4f14-873a-e4b61ee2a9da",
  "managementAreaId": null
}
```

Response `201`:

```json
{
  "id": "531f1f56-748b-49f0-b0c4-9ef72a74ae18",
  "userId": "6e7fd59f-1499-4f7a-bb47-5d6a09d32650",
  "role": {
    "id": "4a720a60-e48a-4f14-873a-e4b61ee2a9da",
    "name": "MANAGER"
  },
  "managementArea": {
    "id": "2ab9fa8d-a03a-49eb-a8c3-14d9a5d9664d",
    "name": "Bangkok Office"
  },
  "assignedBy": {
    "id": "28545799-3165-4c0e-9295-5b444ca25e83",
    "name": "System Admin"
  },
  "createdAt": "2026-08-15T10:00:00.000Z"
}
```

คู่ `userId + roleId + managementAreaId` ต้องไม่ซ้ำ รวมถึงกรณี `managementAreaId = null` หากซ้ำตอบ `409 ROLE_ASSIGNMENT_ALREADY_EXISTS`

### `DELETE /users/{userId}/role-assignments/{assignmentId}`

ต้องมี global `role:assign` และ assignment ต้องเป็นของ `userId` ใน path

Response `204` ไม่มี body ห้ามถอด assignment หากทำให้ไม่เหลือ active global ADMIN โดยตอบ `409 LAST_GLOBAL_ADMIN`

## Management-area lookup

### `GET /management-areas`

ผู้ใช้ที่ login แล้วเรียกได้สำหรับ role assignment form รองรับ `search`, `cursor`, `limit` และคืน `{ data, pageInfo }`

แต่ละ item:

```json
{
  "id": "2ab9fa8d-a03a-49eb-a8c3-14d9a5d9664d",
  "name": "Bangkok Office",
  "description": "Main office",
  "createdAt": "2026-08-15T09:00:00.000Z",
  "updatedAt": "2026-08-15T09:00:00.000Z"
}
```

## Authorization matrix

| Endpoint                                       | Authentication | Authorization                      |
| ---------------------------------------------- | -------------- | ---------------------------------- |
| `POST /auth/login`                             | Public         | -                                  |
| `GET /auth/me`                                 | Bearer         | active user                        |
| `POST /auth/logout`                            | Bearer         | active user                        |
| `GET /permissions`                             | Bearer         | active user                        |
| `GET /roles`                                   | Bearer         | active user                        |
| `PATCH /roles/{roleId}`                        | Bearer         | global ADMIN                       |
| `GET /users`                                   | Bearer         | any user administration permission |
| `POST /users`                                  | Bearer         | global `user:create`               |
| `GET /users/{userId}`                          | Bearer         | any user administration permission |
| `PATCH /users/{userId}/status`                 | Bearer         | global `user:disable`              |
| `POST /users/{userId}/role-assignments`        | Bearer         | global `role:assign`               |
| `DELETE /users/{userId}/role-assignments/{id}` | Bearer         | global `role:assign`               |
| `GET /management-areas`                        | Bearer         | active user                        |

“Any user administration permission” หมายถึงมีอย่างน้อยหนึ่ง permission จาก `user:create`, `user:disable`, `role:assign` ใน global scope

## Implementation invariants

- Login ต้องใช้ generic error และ compare password อย่างปลอดภัย
- Access token อย่างน้อยต้องมี `sub`, `iat`, `exp`, `jti`; ห้ามเชื่อ claims ด้าน permission สำหรับ critical mutation โดยไม่ตรวจฐานข้อมูล
- User create, status update, role update และ assignment mutation ต้องเขียน audit log เมื่อระบบเพิ่ม audit model แล้ว
- Role update และ assignment mutation ต้องอยู่ใน transaction เมื่อมีการตรวจ last global ADMIN
- การแก้ role ต้องทำให้ session context ที่ขอครั้งถัดไปสะท้อน permissions ใหม่
- Prisma-generated objects ห้ามถูก serialize ออก API โดยตรง
- DTO response ต้องเลือก field แบบ allowlist

## Consumer workflow while API is under development

1. Bundle contract ด้วย `cd backend && npm run openapi:bundle`
2. Import `docs/backend_spec/contracts/dist/openapi.bundle.yaml` เข้า mock server หรือ API client generator
3. ตั้ง mock base URL ให้แทน `/api/v1`
4. ใช้ UUID และ timestamps ที่ valid ใน fixture
5. ทดสอบทั้ง success, 401, 403, 409 และ 422
6. เมื่อ backend endpoint พร้อม ให้เปลี่ยนเพียง base URL และรัน contract tests ชุดเดิม

Backend ถือว่า endpoint พร้อมให้ integration เมื่อ OpenAPI validation ผ่าน, response ไม่มี secret fields, authorization tests ผ่าน และตัวอย่าง request/response ในเอกสารยังใช้ได้

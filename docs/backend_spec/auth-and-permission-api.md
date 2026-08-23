# Authentication and permission API

[← Backend specification](README.md) · [OpenAPI contract](contracts/openapi.yaml)

เอกสารนี้อธิบาย endpoint behavior, validation และ error สำหรับ password authentication, session context, user administration, role definition และ role assignment เพื่อให้ frontend, integration client และ backend พัฒนาแยกกันได้ ตาม request/response shape ที่ [`contracts/openapi.yaml`](contracts/openapi.yaml) และ [`contracts/components/schemas/`](contracts/components/schemas/) กำหนด — เอกสารนี้ไม่ hand-write JSON body ซ้ำ หากตัวอย่างในเอกสารเก่ากับ OpenAPI ต่างกัน ให้ยึด OpenAPI เป็น machine-readable contract เสมอ

Permission key แต่ละตัวมีความหมายทางธุรกิจอะไรบ้าง และ role ไหน default มี permission อะไร: [software_spec/permissions-and-rbac.md](../software_spec/permissions-and-rbac.md) — เอกสารนี้อธิบายเฉพาะกลไก backend ที่ enforce กฎเหล่านั้น

## Contract status

- Version: `v1`
- Base path: `/api/v1`
- Content type: `application/json`
- Field naming: `camelCase`
- ID: UUID string
- Date/time: ISO 8601 พร้อม timezone
- Authentication: `Authorization: Bearer <accessToken>`
- Access token อายุเริ่มต้น 15 นาที

ระหว่าง backend ยังไม่เสร็จ ผู้ใช้ API สามารถ import OpenAPI เข้า Prism, Mockoon, Postman หรือเครื่องมือ generate client ได้ โดย mock ต้องรักษา status code และ response shape ตาม `contracts/`

## Security model

ระบบใช้ RBAC ร่วมกับ management-area scope:

- `Role.permissions` เก็บ permission keys
- `UserRole.managementAreaId = null` หมายถึง permission มีผลทั้งระบบ
- `UserRole.managementAreaId = UUID` หมายถึง permission มีผลเฉพาะ management area นั้น
- Effective permission ใน area หนึ่งคือ union ของ global permissions และ permissions ที่ผูกกับ area นั้น
- Frontend ใช้ effective permissions เพื่อแสดง UI เท่านั้น Backend ต้องตรวจ user active, permission และ scope ทุก request

Permission catalog เป็นค่าคงที่ของ application ไม่ใช่ข้อมูลที่ client สร้างเพิ่มเอง ส่วนการเปลี่ยน permissions ภายใน role อนุญาตเฉพาะผู้ที่มี global `ADMIN` assignment เพื่อป้องกัน privilege escalation

ใน `effectivePermissions.byManagementArea[].permissions` backend ต้องคืนค่า union ที่คำนวณแล้ว โดยรวม global permissions ด้วย ไม่ใช่คืนเฉพาะ scoped permissions

## Common request rules

Protected endpoint ต้องส่ง `Authorization: Bearer <token>` และ `Accept: application/json`; `X-Request-Id` เป็น optional หากไม่ส่ง backend ต้องสร้างและคืนค่าใน response header ชื่อเดียวกัน ห้ามใส่ access token, password หรือข้อมูลลับใน URL/query string

List endpoint ใช้ cursor pagination ตามรูปแบบใน `contracts/components/schemas/common.yaml` — `limit` ค่าเริ่มต้น `20`, ต่ำสุด `1`, สูงสุด `100`; `cursor` เป็น opaque string ห้าม client แกะหรือสร้างเอง; การเรียงลำดับต้อง deterministic โดยใช้ `createdAt DESC, id DESC` หาก endpoint ไม่ระบุอย่างอื่น

## Common error contract

Error shape และ error code กลาง (400/401/403/409/422/429) กำหนดไว้ที่ [algorithms-and-validation.md §1.6](algorithms-and-validation.md#16-error-response) เอกสารนี้เพิ่มเฉพาะ error code ที่จำเพาะกับ auth/user/role domain:

| HTTP | Code                              | ใช้เมื่อ                                              |
| ---- | --------------------------------- | ------------------------------------------------------ |
| 401  | `INVALID_CREDENTIALS`             | Login ไม่สำเร็จ โดยไม่บอกว่าพบ username หรือไม่        |
| 404  | `USER_NOT_FOUND`                  | ไม่พบ resource ที่ caller มีสิทธิ์เห็น                  |
| 404  | `ROLE_NOT_FOUND`                  | ไม่พบ role                                              |
| 404  | `ROLE_ASSIGNMENT_NOT_FOUND`       | ไม่พบ role assignment                                   |
| 404  | `MANAGEMENT_AREA_NOT_FOUND`       | ไม่พบ management area                                   |
| 409  | `USERNAME_ALREADY_EXISTS`         | Username ซ้ำตอนสร้าง user                               |
| 409  | `EMAIL_ALREADY_IN_USE`            | Email ซ้ำตอน self-service `PATCH /users/me`             |
| 409  | `ROLE_ASSIGNMENT_ALREADY_EXISTS`  | Role และ scope ซ้ำ                                      |
| 409  | `SELF_DEACTIVATION_NOT_ALLOWED`   | Actor พยายามปิด account ของตัวเอง                       |
| 409  | `LAST_GLOBAL_ADMIN`               | การเปลี่ยนแปลงจะทำให้ไม่เหลือ global ADMIN ที่ active   |

Response 401 ต้องส่ง `WWW-Authenticate: Bearer` ด้วย

## Endpoints

Endpoint behavior, algorithm และ validation แต่ละเส้นอยู่ใน [algorithms-and-validation.md](algorithms-and-validation.md) ส่วนนี้สรุปเฉพาะ endpoint ที่เกี่ยวกับ auth/permission/user/role และจุดที่ต้องรู้เพิ่มจาก algorithm reference:

| Endpoint | Contract path | Algorithm |
| --- | --- | --- |
| `POST /auth/login` | [`contracts/paths/authentication.yaml`](contracts/paths/authentication.yaml) | [§2.1](algorithms-and-validation.md#21-post-authlogin) |
| `GET /auth/google/login`, `GET /auth/microsoft/login`, `GET /auth/*/connect`, `GET /auth/*/callback` | [`contracts/paths/oauth-account-linking.yaml`](contracts/paths/oauth-account-linking.yaml) | [§2.2](algorithms-and-validation.md#22-get-authgooglelogin--get-authmicrosoftlogin) · [integrations/google-microsoft-auth-and-notifications.md](integrations/google-microsoft-auth-and-notifications.md) |
| `GET /auth/me`, `GET /bff/session` | [`contracts/paths/session.yaml`](contracts/paths/session.yaml) | [§2.3](algorithms-and-validation.md#23-get-authme--get-bffsession) |
| `POST /auth/logout` | [`contracts/paths/authentication.yaml`](contracts/paths/authentication.yaml) | [§2.4](algorithms-and-validation.md#24-post-authlogout) |
| `GET /permissions` | [`contracts/paths/access-control.yaml`](contracts/paths/access-control.yaml) | [§3.1](algorithms-and-validation.md#31-get-permissions) |
| `GET /roles`, `POST /roles`, `PATCH /roles/{roleId}` | [`contracts/paths/access-control.yaml`](contracts/paths/access-control.yaml) | [§3.2–3.4](algorithms-and-validation.md#32-get-roles) |
| `GET /users`, `GET /users/directory`, `POST /users`, `GET /users/{userId}`, `PATCH /users/{userId}/status`, `PATCH /users/me`, `POST /users/me/password` | [`contracts/paths/users.yaml`](contracts/paths/users.yaml) | [§4.1–4.4](algorithms-and-validation.md#41-get-users) |
| `POST /users/{userId}/role-assignments`, `DELETE /users/{userId}/role-assignments/{assignmentId}` | [`contracts/paths/users.yaml`](contracts/paths/users.yaml) | [§4.5–4.6](algorithms-and-validation.md#45-post-usersuseridrole-assignments) |
| `GET /management-areas`, `POST /management-areas`, `PATCH /management-areas/{id}`, `DELETE /management-areas/{id}` | [`contracts/paths/management-areas.yaml`](contracts/paths/management-areas.yaml) | [§5](algorithms-and-validation.md#5-management-area-api) |

"Any user administration permission" หมายถึงมีอย่างน้อยหนึ่ง permission จาก `user:create`, `user:disable`, `role:assign` ใน global scope

### Login with a linked Google/Microsoft account

`POST /auth/login` (username+password) คือวิธี login หลักที่ใช้ได้กับทุก user เสมอ ไม่ว่าจะ link provider ไว้หรือไม่ นอกจากนี้ user ที่ link บัญชีไว้แล้วสามารถ login ด้วยวิธีอื่นได้ผ่าน `GET /auth/google/login` หรือ `GET /auth/microsoft/login` — public, redirect ไปหน้า consent ของ provider แล้ววนกลับผ่าน `/callback` เฉพาะ identity ที่ link ไว้แล้วเท่านั้นถึงจะ login สำเร็จ (ไม่มี auto-provisioning ด้วย email) การ link บัญชีทำผ่าน `GET /auth/google/connect` / `GET /auth/microsoft/connect` (ต้อง authenticated อยู่แล้ว) ดูรายละเอียดที่ [integrations/google-microsoft-auth-and-notifications.md](integrations/google-microsoft-auth-and-notifications.md) และการตั้งค่าที่ [integrations/oauth-setup.md](integrations/oauth-setup.md)

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

Backend ถือว่า endpoint พร้อมให้ integration เมื่อ OpenAPI validation ผ่าน, response ไม่มี secret fields, authorization tests ผ่าน และตัวอย่าง request/response ใน `contracts/` ยังใช้ได้

# Implemented API inventory

[← Backend specification](../README.md) · [OpenAPI contract](../contracts/README.md)

เอกสารนี้ตรวจจาก NestJS controllers ที่ register ใน `AppModule` ณ วันที่ 19 สิงหาคม 2026 (หลัง migration serialized asset units, personal asset units และงาน account-link) ทุก endpoint อยู่ใต้ prefix `/api/v1` ยกเว้นไฟล์ที่ serve แบบ static ใต้ `/uploads/` ทุก route ต้องใช้ Bearer token นอกจาก `POST /auth/login`

## Architecture

```mermaid
flowchart LR
    F[React + Vite] -->|JSON / multipart| G[Fastify global guards]
    G --> C[NestJS controllers]
    C --> S[Domain services]
    S --> P[Prisma ORM]
    P --> D[(PostgreSQL)]
    C --> U[(Local uploads)]

    style F fill:#e3f2fd
    style C fill:#fff3e0
    style D fill:#e1f5e1
    style U fill:#fce4ec
```

Authentication guard สร้าง actor/session จาก JWT ทุก request, access guard บังคับ decorator ระดับ global และ service layer บังคับ management-area scope สำหรับ asset/reservation operations

## Authentication and session

| Method | Path | Behavior/access |
| --- | --- | --- |
| POST | `/auth/login` | Public, rate limit 10/minute, username/password login และคืน bearer token/session |
| GET | `/auth/me` | คืน current `SessionContext` |
| POST | `/auth/logout` | คืน 204; token เป็น stateless จึงไม่มี server-side revocation |
| GET | `/bff/session` | session endpoint ที่ frontend shell ใช้ |
| GET | `/auth/google/login`, `/auth/microsoft/login` | Public, login ทางเลือกด้วยบัญชีที่ link ไว้แล้ว |
| GET | `/auth/google/connect`, `/auth/microsoft/connect` | Authenticated, เริ่ม flow link บัญชี provider |
| GET | `/auth/google/callback`, `/auth/microsoft/callback` | Public, OAuth callback สำหรับทั้ง login และ connect |

## Access control and administration

| Method | Path | Behavior/access |
| --- | --- | --- |
| GET | `/permissions` | permission catalog; authenticated |
| GET | `/roles` | role list; authenticated |
| POST | `/roles` | สร้าง role และ normalize permission dependency; Global ADMIN |
| PATCH | `/roles/{roleId}` | แก้ description/permissions แบบ optimistic concurrency; Global ADMIN |
| GET | `/management-areas` | search/cursor list; authenticated |
| GET | `/management-areas/{id}` | detail พร้อม asset/user-role counts; Global ADMIN |
| POST | `/management-areas` | สร้าง area ชื่อ unique; Global ADMIN |
| PATCH | `/management-areas/{id}` | แก้ชื่อ/description; Global ADMIN |
| DELETE | `/management-areas/{id}` | ลบเมื่อไม่มี asset; Global ADMIN |
| GET | `/users` | search/status/role/area list; global user-admin permission อย่างน้อยหนึ่งรายการ |
| POST | `/users` | สร้าง password user; global `user:create` |
| GET | `/users/{userId}` | user profile/auth providers/role assignments; global user-admin permission |
| PATCH | `/users/me` | self-service: user แก้ name/email ของตัวเอง; authenticated เท่านั้น ไม่ต้องมี admin permission |
| POST | `/users/me/password` | self-service: user เปลี่ยน password ของตัวเอง (ต้องใส่ current password); คืน 204 |
| PATCH | `/users/{userId}/status` | enable/disable พร้อม `expectedUpdatedAt`; global `user:disable` |
| POST | `/users/{userId}/role-assignments` | assign global หรือ area-scoped role; global `role:assign` |
| DELETE | `/users/{userId}/role-assignments/{assignmentId}` | remove assignment, 204; global `role:assign` |

## Assets, inventory and uploads

| Method | Path | Behavior/access |
| --- | --- | --- |
| GET | `/assets` | scoped search/filter/cursor list พร้อม availability/capabilities |
| POST | `/assets` | create one asset |
| POST | `/assets/batch` | create assets หลายรายการ |
| POST | `/assets/batch-remove` | soft-disable หลาย asset แบบ optimistic concurrency |
| POST | `/assets/units/batch-retire` | atomic audited retirement ของ asset unit หลายรายการ (BROKEN/LOST/INACTIVE) ตาม serial number |
| PATCH | `/assets/units/{assetUnitId}/status` | เปลี่ยน status asset unit เดียว (ACTIVE/RESERVED/CHECKED_OUT/BROKEN/LOST/IN_REPAIR/INACTIVE) |
| GET | `/assets/{assetId}` | detail, active allocations และ asset unit ledger |
| PATCH | `/assets/{assetId}` | edit metadata พร้อม `expectedUpdatedAt` |
| PATCH | `/assets/{assetId}/status` | activate/deactivate พร้อม `expectedUpdatedAt` |
| DELETE | `/assets/{assetId}` | compatibility soft-deactivate endpoint |
| GET | `/assets/{assetId}/units` | list serial-numbered unit ของ asset นี้ พร้อม status filter/cursor |
| POST | `/assets/{assetId}/units` | atomic audited registration ของ asset unit ใหม่ (serial number) หลายรายการให้ asset นี้ |
| POST | `/uploads/image` | authenticated multipart upload, field `file`, หนึ่งไฟล์สูงสุด 10 MiB; คืน `/uploads/assets/{filename}` |

Asset and inventory services ตรวจ permission และ management-area scope ตาม operation ส่วน `/uploads/image` ปัจจุบันต้อง login แต่ไม่มี resource permission เพิ่มเติม Static file URL ใต้ `/uploads/` ไม่ผ่าน `/api/v1`

## Reservations

| Method | Path | Behavior/access |
| --- | --- | --- |
| GET | `/reservations` | views `MINE`, `APPROVALS`, `ALL`; status/area/search/date/cursor filters และ visibility policy |
| POST | `/reservations` | create DRAFT/PENDING; zero-item event auto-approve |
| GET | `/reservations/{reservationId}` | detail, availability, warnings, approvals, change requests และ capabilities |
| POST | `/reservations/{reservationId}/submit` | submit draft ด้วย optimistic concurrency; zero-item draft auto-approve |
| POST | `/reservations/{reservationId}/items/{itemId}/decision` | approve/reject item เดียว |
| POST | `/reservations/{reservationId}/items/{itemId}/prepare` | assign serial-numbered asset unit ให้ approved item ก่อนส่งมอบ; item ต้องเป็น `APPROVED`, จำนวน unit ต้องตรงกับ approved quantity; item -> `PREPARED` |
| POST | `/reservations/{reservationId}/items/decision` | atomic batch approve/reject |
| POST | `/reservations/{reservationId}/change-requests` | request post-submit schedule/item/participant changes |
| POST | `/reservations/{reservationId}/change-requests/{changeRequestId}/decision` | approve/reject change atomically |
| POST | `/reservations/{reservationId}/delivery-confirm` | confirm equipment handover/pickup; transitions items to `DELIVERED` and reservation to `DELIVERY_CONFIRMED` |
| POST | `/reservations/{reservationId}/cancel` | owner/manager cancellation พร้อม optional reason |

## Returns and inspection

| Method | Path | Behavior/access |
| --- | --- | --- |
| GET | `/returns` | views `MINE`, `APPROVALS`, `ALL`; status/area/reservationId filters และ cursor pagination |
| GET | `/returns/{returnId}` | return slip detail พร้อมรายการตรวจรับ, condition breakdown และ approval status |
| POST | `/reservations/{reservationId}/returns` | borrower/participant submits return slip สำหรับคืนอุปกรณ์; creates return in `PENDING` status |
| POST | `/reservations/{reservationId}/returns/{returnId}/decision` | area manager inspects & decides return with Good, Broken, Lost breakdown; auto-adjusts stock for Broken/Lost and completes reservation |

## Runtime behavior shared by every API

- DTO validation transform/whitelist ทำงาน globally; unknown fields ถูกปฏิเสธและ validation error ใช้ HTTP 422
- Error response มี `{ error: { code, message, fields?, requestId } }` และ response มี `X-Request-Id`
- Global throttle ค่าเริ่มต้น 100 requests/minute; login override เป็น 10/minute
- Swagger UI อยู่ที่ `/api/docs` และ JSON ที่ `/api/docs/openapi.json` เมื่อ bundle contract พบตอน startup
- CORS origins, proxy trust, JWT TTL, database pool และ contract path กำหนดผ่าน environment configuration

## Contract coverage audit

OpenAPI modular source register endpoint ทั้งหมดในตารางนี้ รวม role creation, management-area CRUD, cancellation และ upload แล้ว คำสั่ง `npm run openapi:bundle` เป็นตัวตรวจ `$ref` และสร้าง runtime bundle

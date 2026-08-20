# Implementation status

[← กลับไปสารบัญ](../README.md)

> **นี่คือ dated build/QA snapshot ไม่ใช่ spec** — ห้ามอ้างอิงเอกสารนี้เป็นแหล่งของ requirement หรือ business rule ใดๆ สำหรับ requirement ให้ดู [`../software_spec/`](../software_spec/README.md), สำหรับ API contract ดู [`../backend_spec/contracts/`](../backend_spec/contracts/README.md), สำหรับ UI design ดู [`../frontend_spec/`](../frontend_spec/README.md)

เอกสารนี้เป็น snapshot ของ frontend ที่ตรวจจาก `frontend/src/app.tsx`, `frontend/src/pages`, `frontend/src/components`, `frontend/src/api.ts` และ tests ณ วันที่ 19 สิงหาคม 2026 (หลังงาน OAuth/Outlook account linking, notifications และ self-service account) ใช้แยกสิ่งที่ใช้งานได้จริงออกจากเอกสาร product specification ที่อาจรวม roadmap ในอนาคต

## User flow ที่ implement แล้ว

```mermaid
flowchart TB
    A([เปิดแอป]) --> B{มี access token ที่ใช้ได้?}
    B -->|ไม่มี| C[Login ด้วย username/password หรือ Google/Microsoft ที่ link ไว้แล้ว]
    B -->|มี| D[โหลด BFF session]
    C --> D
    D --> E[Calendar]
    E --> F{เลือกงาน}
    F --> G[ค้นหาและจัดการ Asset]
    F --> H[สร้าง/ดู Reservation]
    F --> I[อนุมัติ item หรือ edit request]
    F --> J[Admin: areas roles users]
    G --> E
    H --> E
    I --> E
    J --> E

    style A fill:#e1f5e1
    style E fill:#e3f2fd
    style I fill:#fff3e0
    style J fill:#fce4ec
```

## Route และ feature inventory

ทุก route ยกเว้น `/login` ผ่าน protected shell; route ที่ไม่รู้จัก redirect ไป `/` และ `/` redirect ต่อไป `/calendar`

| Route | Page/component | Feature ที่ implement แล้ว | Access ที่ UI ใช้ |
| --- | --- | --- | --- |
| `/login` | `LoginPage` | username/password login, Google/Microsoft OAuth login สำหรับบัญชีที่ link ไว้แล้ว, field/API error, callback ไป path เดิม, redirect session ที่ login แล้ว | Public |
| `/auth/callback` | `OAuthCallbackPage` | รับ OAuth callback (Google/Microsoft) หลัง provider consent, จัดการ error state | Public |
| `/connect-account` | `ConnectAccountPage` | mandatory account-link gate เมื่อ `REQUIRE_ACCOUNT_LINK` เปิด บังคับ link Google/Microsoft ก่อนใช้แอปต่อ | Login |
| `/connect-account/callback` | `ConnectAccountCallbackPage` | callback ของ mandatory-link flow | Login |
| `/account` | `AccountPage` | self-service แก้ name/email, เปลี่ยน password, link/unlink Google/Microsoft แบบ optional | Login |
| `/calendar` | `CalendarPage` | continuous month calendar, Today/date picker, status/management-area filters, event minibox, asset picker search/list/grid, date-range drag/keyboard selection, prefill reservation, approve/reject pending items, cancel reservation | Login; permission-gated ตาม capability ที่ API ส่งมา |
| `/assets` | `AssetsPage` | search, management-area/status filters, list/card responsive views, cursor load-more, multi-select, batch stock add/remove, batch disable | permission-gated |
| `/assets/new` | `AssetFormPage` | single/batch create, management-area selection, quantity/description, preview, upload file, camera capture, remove/replace photo | permission-gated |
| `/asset/new` | Redirect | compatibility redirect ไป `/assets/new` | Login |
| `/assets/:assetId` | `AssetDetailPage` | metadata/owner/edit policy, allocations, ledger, activate/deactivate, single stock add/remove | visibility และ capabilities จาก API |
| `/assets/:assetId/edit` | `AssetFormPage` | edit name, area, description และ picture; quantity แก้ผ่าน inventory action | permission-gated |
| `/reservations` | `ReservationsPage` | My reservations/Approval queue tabs, search, grouped status/management-area/date filters, cursor load-more | permission-gated |
| `/reservations/new` | `ReservationCreatePage` | event schedule, optional asset manifest, quantity, URL-prefilled dates/assets, recent reservations, reference lookup, create draft หรือ submit | permission-gated |
| `/reservations/:reservationId` | `ReservationDetailPage` | schedule/requester/participants/items, availability warnings, submit draft, item single/batch approve/reject, cancel, request edit, approve/reject edit request, delivery confirm, **submit/decide return** (per-item return slip, Good/Broken/Lost decision) | capabilities จาก reservation detail |
| `/approvals` | `ApprovalRequestsPage` | รวม pending item approvals ที่ actor ตัดสินใจได้ ข้ามหลาย reservation ในหน้าเดียว | permission-gated |
| `/admin/areas` | `ManagementAreasPage` | search/list, create, edit, delete confirmation | Global ADMIN |
| `/admin/access` | `AccessPage` | permission catalog grouped by resource, role selection, create role, edit description/permissions, dirty-state save | Global ADMIN |
| `/admin/users` | `UsersPage` | search/status/role/area filters, detail drawer, create account with optional uploaded/camera photo, enable/disable, assign/remove scoped roles | permission-gated |
| `/admin/notifications` | `NotificationsPage` | SMTP delivery settings tab และ email-template editor tab (per-situation subject/body) | Global ADMIN |
| `/admin/templates` | Redirect | compatibility redirect ไป `/admin/areas` | Global ADMIN |

Permission key ที่ควบคุมแต่ละ action ดู [software_spec/permissions-and-rbac.md](../software_spec/permissions-and-rbac.md) — ตารางนี้ไม่ restate permission key ซ้ำ

## Shared application features

- Desktop sidebar และ mobile bottom navigation ถูกสร้างตาม effective permissions
- Light/dark theme เก็บใน `localStorage` key `asset-rail.theme`
- Bearer token เก็บใน `sessionStorage` key `asset-rail.access-token`; HTTP 401 ล้าง session ผ่าน event กลาง
- Loading, empty, error, notice, dialog, pagination, filter และ field primitives ใช้ร่วมกันจาก `components/ui.tsx`
- Frontend เรียก API ผ่าน `/api/v1`; dev server proxy ทั้ง `/api` และ `/uploads` ไป backend
- Upload รองรับ file picker และกล้องผ่าน `CameraCaptureModal`; backend จำกัดหนึ่งไฟล์ต่อ request และขนาด 10 MiB
- Layout มี responsive breakpoints สำหรับ navigation, tables/cards, forms, calendar และ dialogs

## Known gaps และ open bugs

- `PREPARED` step (`POST /reservations/:id/items/:itemId/prepare` — assign serial-numbered unit ให้ item ก่อนส่งมอบ) ไม่มี API client หรือ UI command เลย reservation จึงข้ามจาก `APPROVED` ไป `delivery-confirm` ตรงๆ โดยไม่ผ่านขั้น assign unit ทาง UI
- `CHECKED_OUT`/`RETURNED` มี frontend command แล้ว (`confirmDelivery`, `createReturn`, `decideReturn` ใน `ReservationDetailPage`) — ไม่ใช่ gap อีกต่อไป
- ไม่มี standalone inventory-adjustment route; การปรับยอดทำจาก asset list/detail
- **Return payload shape ปัจจุบันผิดฝั่ง frontend**: backend DTO (`backend/src/returns/returns.dto.ts`) และ contract ([backend_spec/contracts/components/schemas/reservations.yaml](../backend_spec/contracts/components/schemas/reservations.yaml)) ตรวจ per-serial-unit shape (`reservationItemUnitIds` ตอน drop-off, `{reservationItemUnitId, condition}` ตอน decision) แต่ frontend ยังส่ง quantity-based shape เก่า (`quantityReturned`/`quantityBroken`/`quantityLost`) ซึ่งถูก backend validation ปฏิเสธด้วย `422` — ผลคือ submit/decide return ผ่าน UI ใช้งานไม่ได้จริงในปัจจุบัน ต้องแก้ frontend request builder ให้ตรง contract
- Asset units: backend มี `POST /assets/units/batch-retire` และ `PATCH /assets/units/:assetUnitId/status` แต่ frontend ไม่มี UI เรียกเส้นทางเหล่านี้ ต้องปลดระวางหรือแก้ status ผ่าน API/DB ตรงๆ
- Frontend ยังใช้ `asset.totalQuantity` และ batch stock add/remove ตามโมเดลเก่า ยังไม่ตามโมเดล serial-numbered `AssetUnit` เต็มรูปแบบที่ backend ใช้แล้ว

## Endpoint status: BFF vs domain call (as-built)

**สถานะปัจจุบัน:** มีแค่ `GET /api/v1/bff/session` เท่านั้นที่เป็น BFF endpoint จริง ทุก UI operation อื่น — Calendar, Asset list/detail, Reservation list/detail, approval queue, return, admin — เรียก domain endpoint ตรงๆ ผ่าน `/api/v1/...` ไม่ผ่าน BFF เลย (`frontend/src/api.ts` เรียก `/reservations`, `/assets`, `/users` ฯลฯ โดยตรง)

| UI operation                              | API surface (เป้าหมายตาม architecture) | สถานะจริง |
| ----------------------------------------- | ----------------------------------------- | ---------- |
| โหลด session/navigation                   | BFF read API                              | ✅ Implemented (`/bff/session`) |
| โหลด Calendar view                        | BFF read API                              | ❌ เรียก `/reservations` ตรง |
| โหลด Asset/Reservation/Return detail view | BFF read API                              | ❌ เรียก domain endpoint ตรง |
| โหลด approval queue                       | BFF read API                              | ❌ เรียก domain endpoint ตรง |
| Create/submit/cancel Reservation          | Domain command API                        | ✅ Implemented |
| Approve/reject item                       | Domain command API                        | ✅ Implemented |
| Register/retire asset unit                | Domain command API                        | ✅ Implemented (register); retire ไม่มี UI — ดู gap ด้านบน |
| Prepare/check out                         | Domain command API                        | ⚠️ Check out (delivery-confirm) implemented; prepare ไม่มี frontend client เลย |
| Create/decide Return                      | Domain command API                        | ⚠️ Implemented แต่ payload shape ผิด — ดู gap ด้านบน |

Recommended BFF read endpoint (ยังไม่ implement — เป้าหมายสถาปัตยกรรม ไม่ blocked การใช้งานปัจจุบันเพราะ frontend เรียก domain endpoint ตรงได้เต็มรูปแบบอยู่แล้ว):

| Route                            | Response purpose                                                | สถานะ |
| --------------------------------- | ------------------------------------------------------------------ | ------ |
| GET /api/v1/bff/session           | User, profile, permissions, scopes และ navigation                  | ✅ Implemented |
| GET /api/v1/bff/calendar          | Reservation bars และ filters สำหรับ visible range                  | ❌ ไม่มี |
| GET /api/v1/bff/assets            | Asset summaries, computed availability และ lookups                 | ❌ ไม่มี |
| GET /api/v1/bff/reservations/:id  | Reservation detail, items, approvals, returns และ capabilities     | ❌ ไม่มี |
| GET /api/v1/bff/approval-queue    | Waiting, mine, resolved summaries                                  | ❌ ไม่มี |
| GET /api/v1/bff/returns/:id       | Return detail, remaining quantities และ capabilities                | ❌ ไม่มี |
| GET /api/v1/bff/admin/users/:id   | User profile, roles และ scope assignments                          | ❌ ไม่มี |

## Recognition / Email Templates / Notification Settings modules

Route inventory ของ 3 module นี้ (Recognition 11 routes, EmailTemplates 5 routes, NotificationSettings 3 routes) — ดู [backend_spec/modules/](../backend_spec/modules/) frontend `/admin/notifications` ครอบคลุม email-template editor และ SMTP settings tab (ดูตาราง route ด้านบน) ส่วน as-built coverage เต็มของ Recognition module ฝั่ง frontend ยังไม่ได้สำรวจในรอบนี้

## Data flow

```mermaid
sequenceDiagram
    participant U as User
    participant F as React frontend
    participant B as NestJS API
    participant P as PostgreSQL via Prisma
    participant S as Local upload storage

    U->>F: เปิด protected route
    F->>B: GET /api/v1/bff/session
    B->>P: โหลด user roles และ scopes
    P-->>B: session source
    B-->>F: SessionContext
    U->>F: query หรือ mutation
    F->>B: Bearer-authenticated API request
    B->>P: permission-aware read / transaction
    P-->>B: domain result
    B-->>F: JSON หรือ structured error
    opt image upload
        F->>B: multipart POST /uploads/image
        B->>S: stream file
        B-->>F: public /uploads/assets URL
    end
```

## Verification map

Vitest coverage มีสำหรับ API/auth และหน้า Login, Access, Management Areas, Assets, Asset Form, Calendar, Reservation Create/List/Detail ส่วน `AssetDetailPage`, `UsersPage` และ shared shell/UI ยังไม่มี page-level test โดยตรง จึงต้องพึ่ง TypeScript build และ manual/runtime verification เพิ่มเติม

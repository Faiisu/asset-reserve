# Asset Reservation — Frontend Design Specification

เอกสารนี้เป็น single source of truth สำหรับ **การออกแบบ UI/UX** ของ frontend ระบบจองและคืนทรัพย์สิน ครอบคลุมเฉพาะหน้าจอ, component, ภาษาการออกแบบ (visual language), interaction และ accessibility เท่านั้น

**เอกสารนี้ไม่ใช่ที่มาของ business rule, permission model, status enum หรือ API contract** — เรื่องเหล่านั้นอยู่ใน [`../software_spec/`](../software_spec/README.md) และ [`../backend_spec/`](../backend_spec/README.md) เสมอ ดู [cross-reference convention](../README.md) สำหรับหลักการอ้างอิงข้าม spec

เอกสารที่เกี่ยวข้อง:

- [Software specification](../software_spec/README.md) — business rule, lifecycle, permission
- [Backend specification](../backend_spec/README.md) — API contract และ implementation
- [Implemented frontend surface](../status/implementation-status.md) — route และ feature ที่ตรวจจาก source ปัจจุบัน (as-built snapshot ไม่ใช่ spec)

## Documentation structure

| กลุ่ม  | เอกสาร                                                       | เนื้อหา                                        |
| ------ | ------------------------------------------------------------ | ---------------------------------------------- |
| Pages  | [Login](pages/login.md)                                      | หน้าจอ authentication                          |
| Pages  | [Calendar](pages/calendar.md)                                | Calendar layout และการเริ่มสร้าง Reservation   |
| Pages  | [Assets & inventory](pages/assets-and-inventory.md)          | หน้าจอ asset และ inventory ledger              |
| Pages  | [Reservations](pages/reservations.md)                        | หน้าจอ create/lifecycle/approval ของ reservation |
| Pages  | [Returns](pages/returns.md)                                  | หน้าจอ partial return และ return approval      |
| Pages  | [Administration](pages/admin.md)                              | หน้าจอ users, roles และ management areas       |
| Detail | [Design System](design-system.md)                             | Typography, Color tokens, Component patterns (canonical: [design-system.html](design-system.html)) |
| Detail | [Application shell](application-shell.md)                      | Navigation, visual language, accessibility     |
| Detail | [Status → color mapping](status-color-mapping.md)              | สีและ label ของแต่ละ status บน UI              |
| Detail | [Data-fetching architecture](data-fetching-architecture.md)    | BFF vs domain endpoint, query-key convention   |
| Detail | [UI states & accessibility](ui-states-and-accessibility.md)    | Loading/empty/error state, responsive design   |
| Detail | [Engineering conventions](engineering-conventions-frontend.md) | โครงสร้างโฟลเดอร์และ naming convention         |

```text
docs_v2/frontend_spec/
├── README.md
├── design-system.html          # canonical interactive design guide
├── design-system.md            # short prose companion
├── application-shell.md
├── status-color-mapping.md
├── data-fetching-architecture.md
├── ui-states-and-accessibility.md
├── engineering-conventions-frontend.md
└── pages/
    ├── login.md
    ├── calendar.md
    ├── assets-and-inventory.md
    ├── reservations.md
    ├── returns.md
    └── admin.md
```

## MVP flow และ business scope

ลำดับการใช้งานหลัก (login → calendar → สร้าง reservation → อนุมัติ → checkout → คืน) และ state machine ทั้งหมดเป็น business rule — ดู [software_spec/lifecycle-and-state-machines.md](../software_spec/lifecycle-and-state-machines.md) เอกสารนี้ไม่ restate flowchart หรือ state diagram นั้นซ้ำ

Data model ที่ frontend อ้างอิง (Prisma models ที่เป็นขอบเขตของ MVP) ดูที่ [backend_spec/database-schema.md](../backend_spec/database-schema.md) — frontend ต้องไม่สร้าง field หรือ feature ที่ต้อง persist แต่ไม่มี model รองรับใน schema นั้น

## Information architecture

ตารางด้านล่างคือ route navigation ล้วนๆ (route → หน้าจอ) permission ที่ควบคุมแต่ละ route ดู [software_spec/permissions-and-rbac.md](../software_spec/permissions-and-rbac.md)

| Route                        | หน้า                                |
| ----------------------------- | ------------------------------------ |
| /login                        | Sign in                              |
| /auth/callback                | OAuth callback (Google/Microsoft)    |
| /connect-account (+callback)  | Mandatory account-link gate          |
| /account                      | Self-service profile/password/link   |
| /calendar                     | Reservation calendar                 |
| /assets                       | Asset inventory                      |
| /assets/:id                   | Asset details และ unit event ledger  |
| /assets/new                   | Create asset                         |
| /assets/:id/edit              | Edit asset                           |
| /reservations                 | My reservations / approval queue     |
| /approvals                    | รวม item และ change-request approvals ที่ทำได้ |
| /reservations/new             | Create reservation                   |
| /reservations/:id             | Reservation details (submit/decision/delivery-confirm/return อยู่ในหน้านี้ ไม่ใช่ route แยก) |
| /admin/users                  | Users and roles                      |
| /admin/areas                  | Management areas                     |
| /admin/access                 | Permission catalog และ role editor   |
| /admin/notifications          | SMTP settings และ email templates    |

> ตารางนี้แสดง route ที่ register ใน `frontend/src/app.tsx` จริง — ไม่มี `/returns`, `/returns/:id` หรือ `/inventory/adjustments/new` เป็น route แยกต่างหาก สำหรับสถานะ feature รายหน้าและข้อจำกัดของ frontend ปัจจุบัน ดู [Implemented frontend surface](../status/implementation-status.md)

หลัง login หรือเข้า / ให้ redirect ไป /calendar

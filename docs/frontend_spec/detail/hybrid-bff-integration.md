# Hybrid BFF integration

[← กลับไปสารบัญ](../README.md)

Frontend ใช้ backend แบบ Hybrid BFF โดยแยก page query ออกจาก domain command

## Endpoint selection

| UI operation                              | API surface        |
| ----------------------------------------- | ------------------ |
| โหลด session/navigation                   | BFF read API       |
| โหลด Calendar view                        | BFF read API       |
| โหลด Asset/Reservation/Return detail view | BFF read API       |
| โหลด approval queue                       | BFF read API       |
| Create/submit/cancel Reservation          | Domain command API |
| Approve/reject item                       | Domain command API |
| Inventory adjustment                      | Domain command API |
| Prepare/check out                         | Domain command API |
| Create/approve Return                     | Domain command API |

## Recommended BFF reads

| Route                            | Response purpose                                               |
| -------------------------------- | -------------------------------------------------------------- |
| GET /api/v1/bff/session          | User, profile, permissions, scopes และ navigation              |
| GET /api/v1/bff/calendar         | Reservation bars และ filters สำหรับ visible range              |
| GET /api/v1/bff/assets           | Asset summaries, computed availability และ lookups             |
| GET /api/v1/bff/reservations/:id | Reservation detail, items, approvals, returns และ capabilities |
| GET /api/v1/bff/approval-queue   | Waiting, mine, resolved summaries                              |
| GET /api/v1/bff/returns/:id      | Return detail, remaining quantities และ capabilities           |
| GET /api/v1/bff/admin/users/:id  | User profile, roles และ scope assignments                      |

ชื่อ endpoint เป็น contract เป้าหมายและต้องยืนยันใน OpenAPI ก่อน implement

## Frontend rules

- ใช้ generated OpenAPI client ห้ามเขียน Prisma-shaped client ด้วยมือ
- BFF response เป็น read model สำหรับแสดงผลและไม่ใช้เป็น mutation payload โดยอัตโนมัติ
- Mutation payload ใช้ command DTO เฉพาะ operation
- หลัง mutation สำเร็จให้ invalidate BFF query ที่ได้รับผลกระทบ
- Search/date changes ต้อง debounce และ cancel request เก่า
- Calendar ขอเฉพาะ visible range
- หลีกเลี่ยงการเรียก domain endpoints หลายชุดเพื่อประกอบ page หาก BFF มี page endpoint แล้ว
- ห้ามคำนวณ permission, availability หรือ aggregate status เป็น source of truth ใน browser

## Query-key ownership

| Domain             | Query key prefix               |
| ------------------ | ------------------------------ |
| Session            | session                        |
| Calendar           | calendar + range + area        |
| Assets             | assets + filters               |
| Reservation detail | reservation + id               |
| Approval queue     | approval-queue + tab + filters |
| Return detail      | return + id                    |
| Administration     | admin + resource + filters     |

Mutation ต้อง invalidate เฉพาะ keys ที่เกี่ยวข้อง ไม่ clear query state ทั้ง application

## Error handling

Frontend ต้องรองรับ structured errors จากทั้ง BFF และ Domain API ด้วยรูปแบบเดียวกัน ได้แก่ requestId, code, message และ fields โดย:

- 401: ไป login หรือ refresh session ตาม policy
- 403: แสดง forbidden state
- 404: แสดง resource not found
- 409: refresh affected BFF data และแสดง conflict
- 422: map fields กลับเข้าฟอร์ม
- 5xx/network: คง input และให้ retry อย่างปลอดภัย

## Acceptance criteria

- Page หลักไม่ต้องยิง request แบบ N+1 เพื่อประกอบข้อมูล
- Frontend ไม่มี direct Prisma import
- BFF read model และ command DTO เป็น type คนละชุด
- Mutation สำเร็จแล้วข้อมูล page ที่เกี่ยวข้องถูก revalidate
- Request เก่าถูก cancel เมื่อ filter/date เปลี่ยนเร็ว
- OpenAPI-generated client typecheck ผ่าน

# Scope & roadmap

[← กลับไปสารบัญ](README.md)

## Feature ที่ถูกยกเลิก (decommissioned)

- **ReservationChangeRequest (ระบบขอแก้ไข reservation หลัง submit)** — ตัดสินใจยกเลิก feature นี้ เอกสารทั้งหมด (contract, database-schema, algorithms, permissions, lifecycle, frontend spec) ถูกลบ reference ออกแล้ว ณ วันนี้ **แต่ backend/frontend/database ยังไม่ได้ลบโค้ดจริง** — ยังมี endpoint `POST /reservations/:id/change-requests` และ `.../decision`, table `reservation_change_requests`, field `canRequestChange`/`hasPendingChangeRequest`/`changeRequests` ในโค้ดปัจจุบันอยู่ ต้องตามไปลบ/migrate ทิ้งให้ตรงกับเอกสารนี้ก่อนถือว่างานเสร็จ (backend service/controller/dto, Prisma schema + migration, frontend types/components/tests)

## สิ่งที่ไม่อยู่ใน MVP ปัจจุบัน

รายการต่อไปนี้ไม่มี persistence ใน Prisma ปัจจุบัน จึงห้ามระบุว่า backend รองรับแล้ว:

- Workspace settings, timezone และ reminder
- Category และ location ระดับ asset
- Maintenance period/calendar block
- File upload metadata (นอกเหนือจาก URL)
- Optimistic concurrency version (มี `expectedUpdatedAt` timestamp-based แล้ว แต่ไม่มี numeric version field)
- Organization scope ที่แยกจาก ManagementArea
- Hard delete UI สำหรับข้อมูลหลัก

**อัปเดต:** รายการต่อไปนี้เคยอยู่ในลิสต์นี้แต่ implement แล้ว ไม่ใช่ out-of-scope อีกต่อไป — Notification settings/email delivery (`notification_settings`, `email_templates` table, `/admin/notifications`), Asset serial number (`AssetUnit.serialNumber`), per-unit condition (`AssetUnit.status`, `ReturnItemUnit.condition`), checkout entity แยกจาก ReservationItem (`ReservationItemUnit`), audit log ทั่วระบบ (`activity_logs` table, ไม่ใช่ `AssetTransaction` ซึ่งไม่มีอยู่จริง)

หากต้องการ feature ที่ยังไม่มี persistence ต้องแก้ Prisma/database schema ก่อน แล้วจึงอัปเดต software spec, backend spec, frontend spec และ tests พร้อมกัน — ดู [backend_spec/database-schema.md](../backend_spec/database-schema.md)

## ลำดับแนะนำสำหรับพัฒนา MVP

1. สร้าง design tokens, app shell และ accessible primitives
2. ทำ authentication/session และ permission-aware routing
3. สร้าง API client และ frontend contracts
4. ทำ ManagementArea lookup
5. ทำ Asset list/detail/create/edit และ inventory ledger
6. ทำ Calendar จาก Reservation
7. ทำ Create Reservation หลาย item พร้อม quantity
8. ทำ item approval, prepare และ check out
9. ทำ Return และ ReturnApproval
10. ทำ users, roles และ scopes
11. เพิ่ม loading/error/empty states และ E2E tests

เมื่อ Prisma schema เปลี่ยน ต้องตรวจเอกสารส่วน models, fields, status, permissions, API contracts และ acceptance tests ในครั้งเดียวกัน — ทุกจุดเหล่านี้อยู่ใน [software_spec](README.md), [backend_spec](../backend_spec/README.md) และ [frontend_spec](../frontend_spec/README.md) ตามลำดับ

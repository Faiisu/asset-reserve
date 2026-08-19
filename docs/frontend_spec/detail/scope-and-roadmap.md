# Scope and roadmap

[← กลับไปสารบัญ](../README.md)

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

หากต้องการ feature เหล่านี้ ต้องแก้ Prisma/database contract ก่อน แล้วจึงอัปเดต frontend spec และ tests พร้อมกัน

## ลำดับแนะนำสำหรับพัฒนา MVP

1. สร้าง design tokens, app shell และ accessible primitives
2. ทำ authentication/session และ permission-aware routing
3. สร้าง API client และ frontend contracts
4. ทำ ManagementArea lookup
5. ทำ Asset list/detail/create/edit และ inventory ledger
6. ทำ Calendar จาก Reservation
7. ทำ Create Reservation หลาย item พร้อม quantity
8. ทำ item approval, prepare และ check out
9. ทำ ReservationChangeRequest
10. ทำ Return และ ReturnApproval
11. ทำ users, roles และ scopes
12. เพิ่ม loading/error/empty states และ E2E tests

เมื่อ Prisma เปลี่ยน ต้องตรวจเอกสารส่วน models, fields, status, permissions, API contracts และ acceptance tests ในครั้งเดียวกัน

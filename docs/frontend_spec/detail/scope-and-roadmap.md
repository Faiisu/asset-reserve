# Scope and roadmap

[← กลับไปสารบัญ](../README.md)

## สิ่งที่ไม่อยู่ใน MVP ปัจจุบัน

รายการต่อไปนี้ไม่มี persistence ใน Prisma ปัจจุบัน จึงห้ามระบุว่า backend รองรับแล้ว:

- Notification และ unread state
- Workspace settings, timezone และ reminder
- Asset tag/serial number
- Category และ location
- Condition ระดับ asset
- Maintenance period/calendar block
- Checkout entity แยกจาก ReservationItem
- File upload metadata
- Optimistic concurrency version
- Organization scope ที่แยกจาก ManagementArea
- Audit log ทั่วระบบนอก AssetTransaction
- Hard delete UI สำหรับข้อมูลหลัก

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

# Scope & roadmap

[← กลับไปสารบัญ](README.md)

## Feature ที่ถูกยกเลิก (decommissioned)

- **ReservationChangeRequest (ระบบขอแก้ไข reservation หลัง submit)** — ยกเลิกและลบ endpoint, frontend flow, Prisma model และ table แล้วผ่าน migration `20260820164846_drop_reservation_change_requests`

## Feature ที่ backend พร้อมแล้วแต่ยังไม่ทำ UI (deferred by design)

ต่างจากสองหัวข้อข้างล่าง: ของในหัวข้อนี้มี persistence, endpoint และ contract ครบแล้ว แต่**ตั้งใจยังไม่ทำ UI ในรอบนี้** — ไม่ใช่ gap ที่ลืม และไม่ใช่ของที่ถูกยกเลิก

### Asset recognition — การจำแนก asset จากภาพ

**สถานะ: เก็บ reference photo แล้ว แต่ยังไม่ทำ UI จำแนก**

ส่วนที่ทำงานอยู่จริงตอนนี้คือ**ขาเก็บข้อมูล**: ทุกรูปที่แนบกับ asset ตอนสร้าง/แก้ไข ถูกส่งไปเก็บที่ `recognition-service` เป็น reference photo และคำนวณ embedding ไว้ ฐานข้อมูล vector จึงสะสมขึ้นเรื่อยๆ ตามการใช้งานปกติ

ส่วนที่**ยังไม่ทำ**คือขาใช้งาน: `POST /recognition/recognize` และ `POST /recognition/recognize/multi` มีครบทั้งใน `recognition-service`, backend proxy และ contract แต่ยังไม่มีหน้าจอไหนเรียก — `frontend/src/recognitionApi.ts` ครอบคลุมเฉพาะ route ที่จัดการ asset/photo ไม่มี client ของสองเส้นนี้ รายละเอียด endpoint: [backend_spec/modules/recognition.md](../backend_spec/modules/recognition.md)

เจตนาเดิมของฟีเจอร์คือใช้ตอน**ตรวจรับคืน** (เจ้าหน้าที่ถ่ายรูปของที่ถูกคืน ระบบบอกว่าเป็น asset ตัวไหน แทนการไล่หา serial number ด้วยตา) การเก็บ reference photo ต่อไปเรื่อยๆ ตั้งแต่ตอนนี้จึงมีประโยชน์: เมื่อถึงคิวทำ UI ฐานข้อมูลจะมีข้อมูลพร้อมใช้แล้ว ไม่ต้องย้อนกลับมาถ่ายรูป asset ทั้งระบบใหม่

เมื่อถึงคิวทำ ต้องตัดสินใจเรื่องต่อไปนี้ก่อน (ยังไม่มีข้อสรุปในรอบนี้):

- จุดเข้าใช้งานอยู่หน้าไหน — หน้าตรวจรับคืน, asset search หรือทั้งคู่
- ใช้ `recognize` (ของชิ้นเดียวต่อรูป) หรือ `recognize/multi` (ตรวจจับหลายชิ้นในรูปเดียว)
- แสดง `best_match` อย่างเดียว หรือให้ผู้ใช้เลือกจาก `top_matches`
- เมื่อ `similarity` ต่ำกว่า threshold ให้ถือว่าไม่พบ หรือให้เลือกเองต่อได้อยู่ดี

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
8. ทำ item approval (เลือก serial unit พร้อมกันในขั้นตอนเดียว — ดู [lifecycle-and-state-machines.md §3](lifecycle-and-state-machines.md#reservation-item-status)) และ check out
9. ทำ Return และ ReturnApproval
10. ทำ users, roles และ scopes
11. เพิ่ม loading/error/empty states และ E2E tests

เมื่อ Prisma schema เปลี่ยน ต้องตรวจเอกสารส่วน models, fields, status, permissions, API contracts และ acceptance tests ในครั้งเดียวกัน — ทุกจุดเหล่านี้อยู่ใน [software_spec](README.md), [backend_spec](../backend_spec/README.md) และ [frontend_spec](../frontend_spec/README.md) ตามลำดับ

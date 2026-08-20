# Reservations

[← กลับไปสารบัญ](../README.md)

## 1. Create Reservation (/reservations/new)

หน้าฟอร์มสร้างการจองแบ่งออกเป็น 3 ส่วนหลัก:

### Event Details

- `eventName`, `description`, `startAt`/`endAt` — validation rule เต็ม (max length, `endAt > startAt` ฯลฯ) ดู [software_spec/business-rules-and-validation.md](../../software_spec/business-rules-and-validation.md)
- `requesterId` มาจาก Authenticated User Session

### Reservation Items (รายการอุปกรณ์)

- เลือก asset และระบุ quantity ต่อรายการ
- ตรวจสอบ `availableQuantity` แบบ real-time ตามช่วงเวลาที่เลือก และแสดง overlap warning หากมีความต้องการซ้อนทับ
- รองรับการบันทึกแบบ Draft หรือ Submit for approval

### Participants (ผู้ร่วมกิจกรรม)

- เลือก User ในระบบมาร่วมใช้งานใน Event
- ห้ามเลือก User ซ้ำ

## 2. Detail page layout

หน้า `/reservations/:id` เป็น Entity Detail pattern ([design-system.html](../design-system.html) §5.3): hero card แสดงชื่อ event, สถานะ badge, key attributes (ผู้จอง, ช่วงเวลา, area) และปุ่ม action ที่มีสิทธิ์ทำได้ ตามด้วย content breakdown (รายการ asset พร้อมสถานะอนุมัติรายชิ้น, ผู้เข้าร่วม, timeline audit log)

Status lifecycle และความหมายของแต่ละ action (submit, approve/reject, delivery-confirm, return) เป็น business rule — ดู [software_spec/lifecycle-and-state-machines.md](../../software_spec/lifecycle-and-state-machines.md) เอกสารนี้ไม่ restate state diagram ซ้ำ

## 3. Actions ที่หน้านี้เปิดให้ทำ (UI-level)

หน้า reservation detail มี dialog/ปุ่มสำหรับ: confirm delivery, ส่ง return request, ตัดสินใจ return (แยกสภาพ Good/Broken/Lost ต่อหน่วย) แต่ละ action เปิดใช้งานตาม capability flag ที่ backend ส่งมาพร้อม reservation detail (`capabilities.canConfirmDelivery`, `canReturn`, `canDecideReturn` ตามลำดับ — ดู `ReservationDetail.capabilities` ใน [backend_spec/contracts/components/schemas/reservations.yaml](../../backend_spec/contracts/components/schemas/reservations.yaml) และ precondition ของแต่ละ flag ใน [backend_spec/algorithms-and-validation.md §7.3](../../backend_spec/algorithms-and-validation.md)) — permission ที่ควบคุมแต่ละ action ดู [software_spec/permissions-and-rbac.md](../../software_spec/permissions-and-rbac.md), request/response contract ดู [backend_spec/contracts/](../../backend_spec/contracts/README.md)

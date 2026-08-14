# Reservations

[← กลับไปสารบัญ](../README.md)

## Create reservation

หน้า /reservations/new เป็น form เดียวแบ่ง section

### Event details

- eventName required สูงสุด 200 ตัวอักษร
- description optional
- startAt required
- endAt required และต้องมากกว่า startAt
- requesterId มาจาก session
- ค่าเริ่มต้น status เป็น DRAFT

### Reservation items

แต่ละรายการมี:

- assetId
- quantity เป็นจำนวนเต็มมากกว่า 0
- computed availableQuantity สำหรับช่วงเวลาที่เลือก
- warning เมื่อ requested quantity มากกว่าจำนวนที่พร้อมใช้

กติกา:

- หนึ่ง Reservation มีหลาย ReservationItem ได้
- asset เดียวกันอยู่ได้ครั้งเดียวต่อ Reservation
- Asset.isActive=false เลือกไม่ได้
- quantity ต้องไม่เกิน availability ที่ backend ยืนยัน
- เมื่อเวลาเปลี่ยนให้ตรวจ availability ใหม่
- Pending reservation ไม่ควรถูกนับเป็นยอดใช้จริงจนกว่าจะ approved แต่ API อาจแสดง soft warning
- Submit ต้องตรวจ overlap และ quantity ซ้ำที่ backend
- Save draft คง status DRAFT
- Submit for approval เปลี่ยนเป็น PENDING_APPROVAL และสร้าง approval workflow ตาม policy

### Participants

- เพิ่ม ReservationParticipant ได้หลายคน
- ห้ามเพิ่ม user เดิมซ้ำ
- Requester ไม่จำเป็นต้องถูกเพิ่มเป็น participant ซ้ำ
- User picker ต้องค้นหาเฉพาะผู้ใช้ที่ actor มีสิทธิ์เห็น

## Reservation details และ lifecycle

หน้า details แสดง:

- eventName และ description
- requester
- startAt/endAt
- status
- participants
- item list พร้อม asset, quantity และ status
- approval ของแต่ละ item
- change requests
- returns ที่เกี่ยวข้อง
- audit timestamps จาก createdAt/updatedAt และ action timestamps

### Reservation status

Transition ที่ frontend รองรับ:

```text
DRAFT
  -> PENDING_APPROVAL
  -> CANCELLED

PENDING_APPROVAL
  -> APPROVED
  -> PARTIALLY_APPROVED
  -> REJECTED
  -> CANCELLED

APPROVED / PARTIALLY_APPROVED
  -> ACTIVE
  -> CANCELLED

ACTIVE
  -> COMPLETED
```

Backend เป็นผู้ตัดสิน transition ที่อนุญาตจริง Frontend แสดง action จาก capabilities ที่ API ส่งมา

### Reservation item status

```text
PENDING -> APPROVED -> PREPARED -> CHECKED_OUT -> RETURNED
        -> REJECTED
```

- preparedBy และ preparedAt บันทึกผู้เตรียมของ
- checkedOutBy และ checkedOutAt บันทึกผู้ยืนยันการนำออก
- ไม่มี Checkout model แยก; หน้า UI ต้องใช้ ReservationItem fields เหล่านี้
- Action แบบ batch เลือกหลาย item ได้ แต่ backend ต้องอัปเดตแบบ atomic ตาม policy

## Reservation approval

ReservationItemApproval เป็น one-to-one กับ ReservationItem

Approval queue แสดงเฉพาะ item ที่ actor อนุมัติได้ตาม management area:

- ค่าเริ่มต้นเลือก item สถานะ PENDING
- Approve selected เปลี่ยน approval และ item เป็น APPROVED
- Reject selected เปลี่ยน approval และ item เป็น REJECTED
- comment optional
- decidedAt บันทึกเมื่อมีคำตัดสิน
- approverId มาจาก session
- ถ้าทุก item approved ให้ Reservation เป็น APPROVED
- ถ้ามีทั้ง approved และ rejected ให้ Reservation เป็น PARTIALLY_APPROVED
- ถ้าทุก item rejected ให้ Reservation เป็น REJECTED
- ถ้า quantity ไม่เพียงพอหรือเกิด conflict การตัดสินใจต้องล้มเหลวพร้อม HTTP 409

UI ต้องแสดงผลราย item ไม่ใช้สมมติฐานว่าอนุมัติ Reservation แล้วทุก item ผ่านเสมอ

## Reservation change request

Reservation ที่ส่งอนุมัติแล้วไม่ควรแก้ข้อมูลสำคัญโดยตรง ให้สร้าง ReservationChangeRequest:

- reason optional
- changeData เป็น JSON ที่ backend validate ตาม allowlist
- status: PENDING, APPROVED, REJECTED หรือ CANCELLED
- requestedBy มาจาก session
- reviewedBy/reviewedAt มีค่าเมื่อตัดสินใจ
- หน้า details แสดง before/after summary จาก changeData
- Frontend ห้าม render HTML ดิบจาก changeData
- เมื่อ approve backend ต้องใช้การแก้ไขและอัปเดตสถานะใน transaction เดียว

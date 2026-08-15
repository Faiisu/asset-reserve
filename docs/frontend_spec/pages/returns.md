# Returns

> [!WARNING]
> **NOT YET IMPLEMENTED**
> This feature is not yet implemented in the frontend. The documentation below describes a planned/future feature.

[← กลับไปสารบัญ](../README.md)

## Return workflow

### Create return

สร้าง Return จาก Reservation ที่มี item สถานะ CHECKED_OUT:

- reservationId required
- returnedBy มาจาก session
- status เริ่ม PENDING
- returnedAt ยังเป็น null จนรับคืนจริงตาม policy
- Return หนึ่งรายการมี ReturnItem ได้หลายรายการ
- Reservation หนึ่งรายการสามารถมีหลาย Return เพื่อรองรับการคืนบางส่วน

แต่ละ ReturnItem มี:

- reservationItemId
- quantityReturned ตั้งแต่ 0
- quantityBroken ตั้งแต่ 0
- quantityLost ตั้งแต่ 0
- description optional

กติกา validation:

- ผลรวม returned + broken + lost ต้องมากกว่า 0
- ผลรวมต้องไม่เกินจำนวนที่ checkout และยังไม่ถูกคืน
- reservationItem ต้องอยู่ใน reservation เดียวกับ Return
- reservationItem เดียวกันซ้ำไม่ได้ภายใน Return เดียว

### Return approval

ReturnApproval เป็น one-to-one กับ Return:

- approverId มาจาก session
- status: PENDING, APPROVED หรือ REJECTED
- description optional
- decidedAt บันทึกเมื่อตัดสินใจ
- ผู้มี return:approve และ scope ที่ถูกต้องเท่านั้นที่ตัดสินใจได้

Return status ที่แสดง:

| Status    | ความหมาย                                      |
| --------- | --------------------------------------------- |
| PENDING   | รอตรวจรับ                                     |
| APPROVED  | ตรวจรับผ่าน                                   |
| REJECTED  | ปฏิเสธหรือให้แก้ไข                            |
| COMPLETED | backend ประมวลผล item/ledger และปิดการคืนแล้ว |

เมื่อคืนครบ ให้ ReservationItem เป็น RETURNED และเมื่อ item ที่ checkout ทั้งหมดคืนครบ ให้ Reservation เป็น COMPLETED ตาม business rule ของ backend

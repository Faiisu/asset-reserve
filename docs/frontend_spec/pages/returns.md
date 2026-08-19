# Returns

> [!NOTE]
> **Implemented, embedded in reservation detail.** Return creation and decision are real features — `api.createReturn`/`api.decideReturn`, called from `ReservationDetailPage.tsx`. There is no standalone `/returns` route; the flow lives inside `/reservations/:id`.

> [!WARNING]
> **Return payload shape is currently broken.** The real backend DTOs (`backend/src/returns/returns.dto.ts`) validate a per-serial-unit shape (`reservationItemUnitIds` at drop-off, `{reservationItemUnitId, condition: GOOD|BROKEN|LOST}` at decision) — described below. The current frontend code still sends the old quantity-based shape (`quantityReturned`/`quantityBroken`/`quantityLost`), which the backend's `forbidNonWhitelisted` validation rejects with `422`. Submitting or deciding a return through the UI does not currently work. See [frontend-data-contracts.md](../detail/frontend-data-contracts.md) for the full contract.

[← กลับไปสารบัญ](../README.md)

## Return workflow

### Create return

สร้าง Return จาก Reservation ที่มี item ที่ถูก checked-out (unit status `CHECKED_OUT`):

- reservationId required (path param)
- returnedBy มาจาก session
- status เริ่ม PENDING
- returnedAt ยังเป็น null จนรับคืนจริงตาม policy
- Return หนึ่งรายการมี ReturnItem ได้หลายรายการ
- Reservation หนึ่งรายการสามารถมีหลาย Return เพื่อรองรับการคืนบางส่วน

แต่ละ ReturnItem มี:

- reservationItemId
- reservationItemUnitIds: string[] — asset unit (serial) ที่จะคืน 1-200 รายการ, ต้อง unique และต้องอยู่ในสถานะ checked-out ของ item นั้นจริง
- description optional

**ไม่มี field แบบ quantity อีกต่อไป** — การนับจำนวนคืนทำโดยนับความยาวของ `reservationItemUnitIds`

กติกา validation:

- ต้องเลือกอย่างน้อยหนึ่ง unit
- unit ทุกตัวต้องอยู่ใน item ของ reservation เดียวกับ Return และยังไม่เคยถูกคืนมาก่อน
- reservationItem เดียวกันซ้ำไม่ได้ภายใน Return เดียว

### Return approval

ReturnApproval เป็น one-to-one กับ Return:

- approverId มาจาก session
- status: PENDING, APPROVED หรือ REJECTED
- description optional
- decidedAt บันทึกเมื่อตัดสินใจ
- ผู้มี return:approve และ scope ที่ถูกต้องเท่านั้นที่ตัดสินใจได้
- Decision payload ระบุ condition ต่อ unit: `items[].units[]: {reservationItemUnitId, condition: GOOD|BROKEN|LOST}` — GOOD คืน unit เป็น `ACTIVE` (กลับเข้า pool), BROKEN/LOST คืนเป็น `BROKEN`/`LOST` ตามลำดับ ไม่มี quantity field

Return status ที่แสดง:

| Status    | ความหมาย                                      |
| --------- | --------------------------------------------- |
| PENDING   | รอตรวจรับ                                     |
| APPROVED  | ตรวจรับผ่าน                                   |
| REJECTED  | ปฏิเสธหรือให้แก้ไข                            |
| COMPLETED | backend ประมวลผล item/ledger และปิดการคืนแล้ว |

เมื่อคืนครบ ให้ ReservationItem เป็น RETURNED และเมื่อ item ที่ checkout ทั้งหมดคืนครบ ให้ Reservation เป็น COMPLETED ตาม business rule ของ backend

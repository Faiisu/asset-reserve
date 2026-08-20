# Returns

[← กลับไปสารบัญ](../README.md)

> **Implemented, embedded in reservation detail.** Return creation and decision เป็น feature จริง เรียกจาก `ReservationDetailPage.tsx` ไม่มี standalone `/returns` route — flow อยู่ใน `/reservations/:id`

> ปัจจุบัน frontend มี known bug ในการส่ง return payload — ดูสถานะล่าสุดที่ [status/implementation-status.md](../../status/implementation-status.md)

## Return workflow — UI layout

### Create return

สร้าง Return จาก Reservation ที่มี item ที่ถูก checked-out UI ให้ผู้ใช้เลือก asset unit (serial) ที่จะคืนต่อ ReservationItem หนึ่งรายการ; Return หนึ่งรายการมี ReturnItem ได้หลายรายการ และ Reservation หนึ่งรายการสามารถมีหลาย Return เพื่อรองรับการคืนบางส่วน

Field shape (`reservationItemId`, `reservationItemUnitIds`, `description`) และ validation rule ทั้งหมด (จำนวน unit ที่เลือกได้, uniqueness, สถานะ unit ที่ต้องเป็น checked-out) มาจาก contract จริงใน [backend_spec/contracts/components/schemas/reservations.yaml](../../backend_spec/contracts/components/schemas/reservations.yaml) — ไม่ restate DTO ที่นี่

### Return approval

UI แสดงผลตัดสินใจของ ReturnApproval (one-to-one กับ Return) โดยผู้มีสิทธิ์ตรวจรับ ระบุ condition ต่อ unit (GOOD/BROKEN/LOST) ผ่านฟอร์มตรวจรับ — decision payload shape ดู [backend_spec/contracts/components/schemas/reservations.yaml](../../backend_spec/contracts/components/schemas/reservations.yaml)

Return status ที่แสดงบน UI:

| Status    | Label ที่แสดง |
| --------- | -------------- |
| PENDING   | รอตรวจรับ      |
| APPROVED  | ตรวจรับผ่าน    |
| REJECTED  | ปฏิเสธหรือให้แก้ไข |
| COMPLETED | ปิดการคืนแล้ว  |

ความหมายของแต่ละ status, transition และ business rule ตอนคืนครบ (เช่น item เป็น RETURNED, reservation เป็น COMPLETED) ดู [software_spec/lifecycle-and-state-machines.md](../../software_spec/lifecycle-and-state-machines.md)

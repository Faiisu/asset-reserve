# Business rules & validation

[← กลับไปสารบัญ](README.md)

เอกสารนี้รวมกติกาเชิงธุรกิจ (ความหมาย ไม่ใช่ implementation) ของแต่ละ domain การ implement จริง (query, transaction, error code) อยู่ใน [backend_spec/algorithms-and-validation.md](../backend_spec/algorithms-and-validation.md)

## 1. Asset

- ชื่อ (`Asset.name`) ต้อง unique ภายใน management area เดียวกัน ความยาวไม่เกิน 40 ตัวอักษร
- `Asset` เป็น catalog/part-number entry (เช่น "Projector") ไม่ใช่ตัวเครื่องจริง — ตัวเครื่องจริงแต่ละชิ้นคือ `AssetUnit` แยกตาม serial number
- `totalQuantity` ไม่ใช่ field ที่แก้ไขตรงได้ — เป็นค่าที่ derive จากการนับ `AssetUnit` ที่ยัง active เท่านั้น การเพิ่มจำนวนทำได้ทางเดียวคือ register หน่วยใหม่ (serial number)
- Serial number ของ `AssetUnit` ต้อง unique **ทั้งระบบ** ไม่ใช่แค่ต่อ asset — สร้างซ้ำถูกปฏิเสธ
- Deactivate asset ใช้ `Asset.isActive = false` ไม่ hard delete เพื่อรักษา relation และ ledger ที่มีอยู่
- Asset ที่ deactivate แล้วไม่สามารถถูกเพิ่มใน reservation ใหม่ได้
- การ register/retire หน่วยหลายรายการพร้อมกันบันทึกเป็น batch เดียว (`AssetUnitEventBatch`)

## 2. Reservation

- หนึ่ง `Reservation` มีได้หลาย `ReservationItem` และกำหนด quantity ต่อ item ได้อิสระ
- Asset เดิมซ้ำใน `Reservation` เดียวกันไม่ได้
- Participant เดิมเพิ่มซ้ำใน `Reservation` เดียวกันไม่ได้
- `endAt` ต้องมากกว่า `startAt` เสมอ
- **Past-date protection**: `startAt` ต้องอยู่ในอนาคตเทียบกับเวลาปัจจุบัน (`startAt >= now`, อนุญาต grace window 60 วินาทีสำหรับ clock skew) ทั้งตอนสร้างและตอนแก้ไขกำหนดการ
- **Conflict detection**: เมื่อ submit, update หรือ approve reservation ระบบต้องตรวจ overlap ของช่วงเวลาต่อ asset — จำนวนที่ขอต้องไม่เกิน headroom ที่เหลือ โดย headroom คำนวณจาก total unit ที่ active ลบด้วยจำนวนที่ถูกจองแล้วในช่วงเวลาที่ทับซ้อนกัน (นับเฉพาะ item/reservation ที่อยู่ใน status ที่ยัง "กันสิทธิ์" อยู่ เช่น approved ขึ้นไป จนถึงก่อน completed) เกินสิทธิ์ให้ปฏิเสธ — รายละเอียด query/algorithm อยู่ใน [backend_spec/algorithms-and-validation.md](../backend_spec/algorithms-and-validation.md)
- Submit ต้องตรวจ available quantity ซ้ำที่ backend เสมอ (แม้ frontend แสดงเลขมาก่อนแล้ว)
- อนุมัติราย item แล้ว aggregate status ของ reservation ต้องถูกคำนวณใหม่ตาม [lifecycle-and-state-machines.md#reservation-status](lifecycle-and-state-machines.md#reservation-status)
- การแก้ไข reservation **หลัง submit แล้ว** ต้องทำผ่าน `ReservationChangeRequest` เท่านั้น แก้ field ตรงไม่ได้
- Prepare/checkout ต้องบันทึก actor และเวลาที่ดำเนินการ

## 3. Return

- สร้าง Return ได้เฉพาะจาก item ที่ถูก checked-out แล้ว (unit status `CHECKED_OUT`) และยังคืนไม่ครบ
- การคืนอ้างอิงเป็นรายหน่วย (`reservationItemUnitIds`) ไม่มี field แบบ quantity — จำนวนคืนนับจากความยาว array
- ต้องเลือกอย่างน้อยหนึ่ง unit ต่อการ submit
- Unit ทุกตัวที่เลือกต้องอยู่ใน item ของ reservation เดียวกับ Return และยังไม่เคยถูกคืนมาก่อน
- `reservationItemId` เดียวกันซ้ำไม่ได้ภายใน Return เดียวกัน
- Reservation หนึ่งรายการมีได้หลาย Return เพื่อรองรับการคืนบางส่วน
- Decision ต้องระบุ condition ต่อหน่วย (`GOOD`/`BROKEN`/`LOST`) ตาม [lifecycle-and-state-machines.md#condition-classification](lifecycle-and-state-machines.md#condition-classification) — ไม่มี field แบบ quantity ในการตัดสินใจเช่นกัน
- Return approval บันทึก approver และเวลาที่ตัดสินใจ (`decidedAt`) เสมอ
- คืนครบสำหรับ item แล้วให้ `ReservationItem` เป็น `RETURNED`; คืนครบทุก item ที่ checkout แล้วให้ `Reservation` เป็น `COMPLETED` (ดู [lifecycle-and-state-machines.md#return-status](lifecycle-and-state-machines.md#return-status))

## 4. Administration (User / Role / Management area)

- ห้ามมอบ role ซ้ำใน scope เดียวกัน (ดู [permissions-and-rbac.md](permissions-and-rbac.md#6-business-rules-ที่เกี่ยวกับ-rolepermission) สำหรับกติกาที่เกี่ยวกับ role/permission ทั้งหมด)
- ชื่อ management area ต้อง unique ความยาวไม่เกิน 150 ตัวอักษร
- ลบ management area ที่ยังมี asset อยู่ไม่ได้ (ต้อง confirm ก่อนลบเสมอ)

## 5. เกณฑ์คุณภาพข้ามหน้า (cross-cutting)

- ทุกหน้าที่ทำ mutation ต้องป้องกัน double submit (idempotency) — รายละเอียด implementation อยู่ใน [backend_spec/algorithms-and-validation.md](../backend_spec/algorithms-and-validation.md)
- Adjustment/registration หลาย line บันทึกเป็น batch เดียว และต้องไม่ทำให้ `totalQuantity` ติดลบ
- จำนวน returned/broken/lost ต้องไม่ติดลบและไม่เกินยอดค้างคืน

## 6. Recognition, Email templates, Notification settings

- **Recognition**: asset ที่มี `assetId` ต้องผ่าน asset-view access control ปกติก่อนเรียก recognition-service เสมอ (ใช้ permission/scope เดียวกับหน้า asset detail ตาม [permissions-and-rbac.md](permissions-and-rbac.md)) — recognition-service เองไม่มีระบบยืนยันตัวตน ดังนั้น backend เป็นด่านตรวจสิทธิ์เดียว รายละเอียด endpoint: [backend_spec/modules/recognition.md](../backend_spec/modules/recognition.md)
- **Email templates**: มี situation ที่รองรับตายตัว 3 แบบ (`reservation_submitted`, `reservation_decided`, `return_decided`) เพิ่ม/ลบ situation ใหม่ไม่ได้ผ่าน API นี้ — "reset to default" เป็น idempotent (เรียกซ้ำได้แม้ยังไม่เคย customize) รายละเอียด: [backend_spec/modules/email-templates.md](../backend_spec/modules/email-templates.md)
- **Notification settings**: เป็น singleton settings (มีแถวเดียวทั้งระบบ) การบันทึกครั้งแรกต้องระบุ App Password เสมอ ครั้งถัดไปเว้นว่างได้เพื่อคงรหัสเดิม — เฉพาะ global admin เท่านั้นที่เข้าถึงได้ รายละเอียด: [backend_spec/modules/notification-settings.md](../backend_spec/modules/notification-settings.md)

## เอกสารที่เกี่ยวข้อง

- Status enum และ transition: [lifecycle-and-state-machines.md](lifecycle-and-state-machines.md)
- Permission ที่ต้องมีสำหรับแต่ละ action: [permissions-and-rbac.md](permissions-and-rbac.md)
- Algorithm/implementation ของกติกาเหล่านี้: [backend_spec/algorithms-and-validation.md](../backend_spec/algorithms-and-validation.md)
- Error code ที่ backend ตอบเมื่อกติกาถูกละเมิด: [backend_spec/auth-and-permission-api.md](../backend_spec/auth-and-permission-api.md) และ [backend_spec/algorithms-and-validation.md](../backend_spec/algorithms-and-validation.md)

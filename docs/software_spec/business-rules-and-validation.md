# Business rules & validation

[← กลับไปสารบัญ](README.md)

เอกสารนี้รวมกติกาเชิงธุรกิจ (ความหมาย ไม่ใช่ implementation) ของแต่ละ domain การ implement จริง (query, transaction, error code) อยู่ใน [backend_spec/algorithms-and-validation.md](../backend_spec/algorithms-and-validation.md)

## 1. Asset

- ชื่อ (`Asset.name`) ต้อง unique ภายใน management area เดียวกัน ความยาวไม่เกิน 40 ตัวอักษร
- `Asset` เป็น catalog/part-number entry (เช่น "Projector") ไม่ใช่ตัวเครื่องจริง — ตัวเครื่องจริงแต่ละชิ้นคือ `AssetUnit` แยกตาม serial number
- `totalQuantity` ไม่ใช่ field ที่แก้ไขตรงได้ — เป็นค่าที่ derive จากการนับ `AssetUnit` ทุกสถานะยกเว้น `INACTIVE` การเพิ่มจำนวนทำได้ทางเดียวคือ register หน่วยใหม่ (serial number)
- Serial number ของ `AssetUnit` ต้อง unique **ทั้งระบบ** ไม่ใช่แค่ต่อ asset — สร้างซ้ำถูกปฏิเสธ
- Deactivate asset ใช้ `Asset.isActive = false` ไม่ hard delete เพื่อรักษา relation และ ledger ที่มีอยู่
- Asset ที่ deactivate แล้วไม่สามารถถูกเพิ่มใน reservation ใหม่ได้
- การ register/retire หน่วยหลายรายการพร้อมกันบันทึกเป็น batch เดียว (`AssetUnitEventBatch`)
- Asset list ที่แสดงต่อผู้ใช้ต้องคำนวณ `totalQuantity`/available quantity ถูกต้องตามกติกา derive ข้างต้นเสมอ ไม่ใช่ค่าที่ cache ผิดเวลา

## 2. Reservation

- หนึ่ง `Reservation` มีได้หลาย `ReservationItem` และกำหนด quantity ต่อ item ได้อิสระ
- Asset เดิมซ้ำใน `Reservation` เดียวกันไม่ได้
- Participant เดิมเพิ่มซ้ำใน `Reservation` เดียวกันไม่ได้
- `endAt` ต้องมากกว่า `startAt` เสมอ
- **Past-date protection**: `startAt` ต้องอยู่ในอนาคตเทียบกับเวลาปัจจุบัน (`startAt >= now`, อนุญาต grace window 60 วินาทีสำหรับ clock skew) ทั้งตอนสร้างและตอนแก้ไขกำหนดการ
- **Conflict detection**: เมื่อ submit, update หรือ approve reservation ระบบต้องตรวจ overlap ของช่วงเวลาต่อ asset — จำนวนที่ขอต้องไม่เกิน headroom ที่เหลือ โดย pool ที่นำมาจองได้มีเฉพาะ unit สถานะ `ACTIVE`, `RESERVED`, `CHECKED_OUT` (ไม่รวม `BROKEN`, `LOST`, `IN_REPAIR`, `INACTIVE`) แล้วลบจำนวนที่ถูกจองในช่วงเวลาที่ทับซ้อนกัน เกินสิทธิ์ให้ปฏิเสธ — รายละเอียด query/algorithm อยู่ใน [backend_spec/algorithms-and-validation.md](../backend_spec/algorithms-and-validation.md)
- Submit ต้องตรวจ available quantity ซ้ำที่ backend เสมอ (แม้ frontend แสดงเลขมาก่อนแล้ว)
- อนุมัติราย item แล้ว aggregate status ของ reservation ต้องถูกคำนวณใหม่ตาม [lifecycle-and-state-machines.md#reservation-status](lifecycle-and-state-machines.md#reservation-status)
- **Approve เป็น unit-based, reject เป็น item-based**: อนุมัติเลือกได้ 1 ถึง `quantity` ที่ขอ (partial approval ได้จริง) แล้ว `quantity` ของ item จะถูกตัดลงให้เท่ากับจำนวนที่ approve ทันที ไม่มีส่วนที่เหลือค้าง `PENDING` รออนุมัติรอบถัดไป — ส่วนปฏิเสธ (reject) เป็น all-or-nothing ทั้ง item เสมอ ไม่มี concept ปฏิเสธเฉพาะบาง unit ภายใน item เดียวกัน
- **Serial assignment เป็นช่วงเวลา**: `ReservationItemUnit` เก็บ `assignmentStartAt`/`assignmentEndAt`; serial เดียวกันถูก assign ให้หลาย reservation ได้เมื่อช่วง `[start, end)` ไม่ทับกัน แต่ assignment สถานะ `ASSIGNED`/`CHECKED_OUT` ที่ overlap กันต้องถูกปฏิเสธทั้งใน application และ database
- `AssetUnit.status` เป็นสถานะทางกายภาพปัจจุบัน การ approve/cancel future assignment ไม่เปลี่ยนสถานะนี้; `CHECKED_OUT` เกิดเมื่อ handover จริงภายในช่วง reservation เท่านั้น
- การแก้ไข reservation **หลัง submit แล้ว** ไม่รองรับ — `ReservationChangeRequest` ถูกยกเลิก (ดู [scope-and-roadmap.md](scope-and-roadmap.md#feature-ที่ถูกยกเลิก-decommissioned)) ต้องยกเลิก reservation เดิมแล้วสร้างใหม่แทนถ้าต้องการเปลี่ยนกำหนดการ/รายการ
- **Handover เป็น unit-based**: ยืนยัน handover เลือกเฉพาะบาง `ReservationItemUnit` ของ item ได้ ไม่ต้องส่งมอบทั้ง item พร้อมกัน — item ยังอยู่ `PREPARED` ต่อไปจนกว่า unit ที่ผูกไว้ทั้งหมดจะถูกยืนยัน handover ครบ (ยืนยันได้หลายรอบ) `checkedOutBy`/`checkedOutAt` ระดับ item บันทึกเมื่อ item เพิ่งข้ามไป `DELIVERED` (ครบทุก unit แล้ว) เท่านั้น ส่วน `ReservationItemUnit.checkedOutAt` บันทึกต่อหน่วยทุกครั้งที่ยืนยัน
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

- ทุกหน้าที่ทำ mutation ต้องป้องกัน double submit (idempotency) — double click หรือ network retry ต้องไม่สร้าง reservation, approval, ledger หรือ return ซ้ำ — รายละเอียด implementation อยู่ใน [backend_spec/algorithms-and-validation.md](../backend_spec/algorithms-and-validation.md)
- Adjustment/registration หลาย line บันทึกเป็น batch เดียว และต้องไม่ทำให้ `totalQuantity` ติดลบ
- จำนวน returned/broken/lost ต้องไม่ติดลบและไม่เกินยอดค้างคืน
- ผู้ใช้สองคน approve assignment ที่ช่วงเวลาทับกัน หรือ checkout asset unit (serial) เดียวกันพร้อมกัน ต้องมีเพียงฝ่ายเดียวสำเร็จ อีกฝ่าย fail ด้วย `409`; assignment คนละช่วงที่ไม่ทับกันต้องอยู่ร่วมกันได้
- Transaction conflict ต้อง retry ตาม policy ที่กำหนด และตอบ structured `409` เมื่อไม่สามารถดำเนินการได้หลัง retry หมด
- ทุก list endpoint ต้องบังคับ page-size limit
- Backup และ restore procedure ต้องถูกทดสอบอย่างน้อยหนึ่งครั้งก่อน pilot deployment

## 6. Recognition, Email templates, Notification settings

- **Recognition**: asset ที่มี `assetId` ต้องผ่าน asset-view access control ปกติก่อนเรียก recognition-service เสมอ (ใช้ permission/scope เดียวกับหน้า asset detail ตาม [permissions-and-rbac.md](permissions-and-rbac.md)) — recognition-service เองไม่มีระบบยืนยันตัวตน ดังนั้น backend เป็นด่านตรวจสิทธิ์เดียว รายละเอียด endpoint: [backend_spec/modules/recognition.md](../backend_spec/modules/recognition.md)
- **Email templates**: มี situation ที่รองรับตายตัว 3 แบบ (`reservation_submitted`, `reservation_decided`, `return_decided`) เพิ่ม/ลบ situation ใหม่ไม่ได้ผ่าน API นี้ — "reset to default" เป็น idempotent (เรียกซ้ำได้แม้ยังไม่เคย customize) รายละเอียด: [backend_spec/modules/email-templates.md](../backend_spec/modules/email-templates.md)
- **Notification settings**: เป็น singleton settings (มีแถวเดียวทั้งระบบ) การบันทึกครั้งแรกต้องระบุ App Password เสมอ ครั้งถัดไปเว้นว่างได้เพื่อคงรหัสเดิม — เฉพาะ global admin เท่านั้นที่เข้าถึงได้ รายละเอียด: [backend_spec/modules/notification-settings.md](../backend_spec/modules/notification-settings.md)

## 7. Authentication / access

- ผู้ไม่ login ถูก redirect ไป `/login`
- User ที่ `isActive = false` ใช้งาน protected route ไม่ได้
- Navigation และ action ที่แสดงต้องสอดคล้องกับ permissions และ management-area scope ของผู้ใช้จริง ห้าม hardcode
- Backend ต้องตอบ `403` เมื่อเรียก action นอก scope โดยตรง ไม่พึ่งการซ่อนปุ่มฝั่ง frontend เป็นด่านตรวจสิทธิ์เดียว

## เอกสารที่เกี่ยวข้อง

- Status enum และ transition: [lifecycle-and-state-machines.md](lifecycle-and-state-machines.md)
- Permission ที่ต้องมีสำหรับแต่ละ action: [permissions-and-rbac.md](permissions-and-rbac.md)
- Algorithm/implementation ของกติกาเหล่านี้: [backend_spec/algorithms-and-validation.md](../backend_spec/algorithms-and-validation.md)
- Error code ที่ backend ตอบเมื่อกติกาถูกละเมิด: [backend_spec/auth-and-permission-api.md](../backend_spec/auth-and-permission-api.md) และ [backend_spec/algorithms-and-validation.md](../backend_spec/algorithms-and-validation.md)

# Calendar

[← กลับไปสารบัญ](../README.md)

## Calendar

Calendar แสดง Reservation ไม่ใช่ event model แยกต่างหาก

### การแสดงผล

- Month view เป็นค่าเริ่มต้น
- Header มี Previous, Today, Next และช่วงเดือนปัจจุบัน
- Event bar ใช้ Reservation.eventName
- ช่วงเวลาใช้ Reservation.startAt ถึง Reservation.endAt
- Event ที่ข้ามสัปดาห์แบ่ง segment แต่ยังเปิด Reservation เดียวกัน
- คลิก event เปิด minibox พร้อมข้อมูลสรุปและ action ที่ผู้ใช้มีสิทธิ์ใช้ (permission ที่ควบคุม action ดู [software_spec/permissions-and-rbac.md](../../software_spec/permissions-and-rbac.md))
  - View ไป `/reservations/:id`
  - Approve/Reject ตัดสินใจเฉพาะ pending items ที่ backend ระบุว่าผู้ใช้มีสิทธิ์
  - หลังตัดสินใจสำเร็จ Calendar ต้อง refresh สถานะและจำนวนรายการ
- Filter ตาม management area และ reservation status — ตัว status filter option และสี ดู [status-color-mapping.md](../status-color-mapping.md)
- User เห็นรายการของตนเอง รายการที่เป็น participant และข้อมูลอื่นตาม policy ของ backend
- Frontend ต้องไม่รับข้อมูลที่ actor ไม่มีสิทธิ์เห็นแล้วค่อยซ่อนด้วย CSS

Calendar ไม่แสดง maintenance block เพราะ Prisma ปัจจุบันไม่มี maintenance period model

### เริ่มสร้าง Reservation

- ผู้ใช้ลากเลือกวัน หรือกด New reservation
- การลากเลือกวันกำหนดค่าเริ่มต้น startAt และ endAt
- หน้า Calendar ไม่ต้องเลือก asset ใน MVP เพื่อลดความซ้ำซ้อน
- หลังเลือกช่วงเวลาไป /reservations/new พร้อม query startAt และ endAt
- endAt ต้องมากกว่า startAt (validation rule เต็ม ดู [software_spec/business-rules-and-validation.md](../../software_spec/business-rules-and-validation.md))

### Asset picker

- Desktop แสดง Asset picker ด้านข้างสูงเท่ากับ Calendar frame
- ปุ่ม Show all เปิด popup สำหรับดู Asset ทั้งหมดที่ผู้ใช้มีสิทธิ์เลือก
- Popup ปิดได้จากปุ่มปิด, ปุ่ม Escape หรือคลิก backdrop นอก panel
- Popup มี search และ toggle รูปแบบ List/Grid
- เมื่อเลือกช่วงเวลาแล้ว Asset ที่ไม่ available ต้อง disable เป็นสีเทาและเรียงไว้ด้านล่าง
- Selection ใน popup และ Asset picker ด้านข้างต้องใช้ state เดียวกัน
- Layout, ขนาด card, availability badge rule ดู [design-system.html](../design-system.html) §2

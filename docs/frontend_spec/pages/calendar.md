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
- คลิก event เปิด minibox พร้อมข้อมูลสรุปและ action ที่ผู้ใช้มีสิทธิ์ใช้
  - View ไป `/reservations/:id`
  - Approve/Reject ตัดสินใจเฉพาะ pending items ที่ backend ระบุว่าผู้ใช้มีสิทธิ์
  - หลังตัดสินใจสำเร็จ Calendar ต้อง refresh สถานะและจำนวนรายการ
- Filter ตาม management area และ reservation status
  - status filter มี option ตรงตาม 10 สถานะ canonical ใน `DISPLAY_STATUSES` เท่านั้น (ดูตารางด้านล่าง) ไม่ใช่ "ทุกสถานะแยกตัวกัน" — `PENDING`/`ACTIVE`/`RETURN` ไม่ใช่ canonical status (ดู [ReservationStatus.md](../../backend_spec/detail/ReservationStatus.md)) และไม่มี filter option แยกของตัวเอง เลือก `PENDING_APPROVAL` หรือ `DELIVERY_CONFIRMED` หรือ `RETURN_PENDING` จะครอบคลุมค่าเก่าเหล่านี้ไปด้วย (`STATUS_OPTION_STATUSES`)
- User เห็นรายการของตนเอง รายการที่เป็น participant และข้อมูลอื่นตาม policy ของ backend
- Frontend ต้องไม่รับข้อมูลที่ actor ไม่มีสิทธิ์เห็นแล้วค่อยซ่อนด้วย CSS

สีสถานะ (ไม่ใช้ white/grey เพื่อให้แยกแยะรัฐได้ชัดเจน) — ตรงตาม 10 canonical status เท่านั้น:

| Reservation status | สี           |
| ------------------- | ------------ |
| DRAFT               | Slate        |
| PENDING_APPROVAL    | Amber        |
| PARTIALLY_APPROVED  | Purple       |
| APPROVED            | Green        |
| DELIVERY_CONFIRMED  | Teal         |
| RETURN_PENDING      | Orange       |
| RETURN_CONFIRMED    | Emerald      |
| COMPLETED           | Green (เข้ม) |
| REJECTED            | Red          |
| CANCELLED           | Amber (เข้ม) |

`STATUS_COLOR_CLASS` แม็ป `PENDING`/`ACTIVE`/`RETURN` (ค่าเก่าที่ไม่ใช่ canonical status อีกต่อไป) ไปใช้สีเดียวกับ `PENDING_APPROVAL`/`DELIVERY_CONFIRMED`/`RETURN_PENDING` ตามลำดับ — ไม่ได้มีสีแยกของตัวเองแบบ Cyan/Blue ที่เอกสารเดิมอ้างไว้ CSS class `.calendar-legend__pending` (cyan) และ `.calendar-legend__active` (blue) ยังอยู่ใน `calendar.css` แต่เป็น dead code ไม่เคยถูกเรียกใช้จริง

Calendar ไม่แสดง maintenance block เพราะ Prisma ปัจจุบันไม่มี maintenance period model

### เริ่มสร้าง Reservation

- ผู้ใช้ลากเลือกวัน หรือกด New reservation
- การลากเลือกวันกำหนดค่าเริ่มต้น startAt และ endAt
- หน้า Calendar ไม่ต้องเลือก asset ใน MVP เพื่อลดความซ้ำซ้อน
- หลังเลือกช่วงเวลาไป /reservations/new พร้อม query startAt และ endAt
- endAt ต้องมากกว่า startAt

### Asset picker

- Desktop แสดง Asset picker ด้านข้างสูงเท่ากับ Calendar frame
- ปุ่ม Show all เปิด popup สำหรับดู Asset ทั้งหมดที่ผู้ใช้มีสิทธิ์เลือก
- Popup ปิดได้จากปุ่มปิด, ปุ่ม Escape หรือคลิก backdrop นอก panel
- Popup มี search และ toggle รูปแบบ List/Grid
- เมื่อเลือกช่วงเวลาแล้ว Asset ที่ไม่ available ต้อง disable เป็นสีเทาและเรียงไว้ด้านล่าง
- Selection ใน popup และ Asset picker ด้านข้างต้องใช้ state เดียวกัน

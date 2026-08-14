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
- คลิก event ไป /reservations/:id
- Filter ตาม management area และ reservation status
- User เห็นรายการของตนเอง รายการที่เป็น participant และข้อมูลอื่นตาม policy ของ backend
- Frontend ต้องไม่รับข้อมูลที่ actor ไม่มีสิทธิ์เห็นแล้วค่อยซ่อนด้วย CSS

สีสถานะ:

| Reservation status | สี      |
| ------------------ | ------- |
| DRAFT              | Neutral |
| PENDING_APPROVAL   | Amber   |
| PARTIALLY_APPROVED | Purple  |
| APPROVED           | Teal    |
| REJECTED           | Red     |
| CANCELLED          | Gray    |
| ACTIVE             | Blue    |
| COMPLETED          | Green   |

Calendar ไม่แสดง maintenance block เพราะ Prisma ปัจจุบันไม่มี maintenance period model

### เริ่มสร้าง Reservation

- ผู้ใช้ลากเลือกวัน หรือกด New reservation
- การลากเลือกวันกำหนดค่าเริ่มต้น startAt และ endAt
- หน้า Calendar ไม่ต้องเลือก asset ใน MVP เพื่อลดความซ้ำซ้อน
- หลังเลือกช่วงเวลาไป /reservations/new พร้อม query startAt และ endAt
- endAt ต้องมากกว่า startAt

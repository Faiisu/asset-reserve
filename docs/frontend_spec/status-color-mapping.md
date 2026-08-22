# Status → color mapping

[← กลับไปสารบัญ](README.md)

เอกสารนี้กำหนดเฉพาะ**สีและ label ที่ใช้แสดงผล**สำหรับแต่ละ status บน UI (Calendar, list, badge) ความหมายของ status, transition และ enum ที่รองรับทั้งหมดเป็น business rule — ดู [software_spec/lifecycle-and-state-machines.md](../software_spec/lifecycle-and-state-machines.md) เอกสารนี้ไม่ redefine enum นั้นซ้ำ

Status badge ต้องใช้ label และสีเหมือนกันทุกหน้า และต้องมีข้อความกำกับสีเสมอ (สีไม่ใช่วิธีเดียวที่สื่อความหมาย)

## Reservation status color

| Reservation status  | สี          |
| -------------------- | ----------- |
| DRAFT                | Ink (neutral) |
| PENDING_APPROVAL     | Amber       |
| PARTIALLY_APPROVED   | Purple      |
| APPROVED             | Green       |
| DELIVERY_CONFIRMED   | Teal        |
| RETURN_PENDING       | Blue        |
| COMPLETED            | Green (เข้ม)|
| REJECTED             | Red         |
| CANCELLED            | Amber (เข้ม)|

ชื่อกลุ่มสีในตารางนี้ต้องตรงกับ token family ที่มีจริงใน [design-system.html](design-system.html) เท่านั้น (`--ink`, `--blue`, `--teal`, `--amber`, `--red`, `--green`, `--purple` — ไม่มี Slate/Orange/Emerald/Cyan) ค่าสีจริง (hex) ดึงจาก token เหล่านั้น — ตารางนี้กำหนดเฉพาะการจับคู่ status ↔ กลุ่มสี

Filter option บน Calendar ใช้เฉพาะ 9 canonical status เท่านั้น ค่าเก่า `PENDING`, `ACTIVE`, `RETURN` ไม่อยู่ใน frontend type/filter และ database constraint ใหม่จะไม่ยอมรับค่าเหล่านี้

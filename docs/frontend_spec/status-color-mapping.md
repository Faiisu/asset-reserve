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
| RETURN_CONFIRMED     | Teal (เข้ม) |
| COMPLETED            | Green (เข้ม)|
| REJECTED             | Red         |
| CANCELLED            | Amber (เข้ม)|

ชื่อกลุ่มสีในตารางนี้ต้องตรงกับ token family ที่มีจริงใน [design-system.html](design-system.html) เท่านั้น (`--ink`, `--blue`, `--teal`, `--amber`, `--red`, `--green`, `--purple` — ไม่มี Slate/Orange/Emerald/Cyan) ค่าสีจริง (hex) ดึงจาก token เหล่านั้น — ตารางนี้กำหนดเฉพาะการจับคู่ status ↔ กลุ่มสี

## Legacy value mapping (compatibility เท่านั้น)

ค่าสถานะเก่าที่ไม่ใช่ canonical status อีกต่อไป (`PENDING`, `ACTIVE`, `RETURN` — ดูรายการ canonical เต็มที่ [software_spec/lifecycle-and-state-machines.md](../software_spec/lifecycle-and-state-machines.md)) ยัง map ไปใช้สีเดียวกับสถานะทดแทนเพื่อ backward-compatible กับข้อมูลเก่า:

| ค่าเก่า   | Map ไปสีของ         |
| --------- | -------------------- |
| `PENDING` | `PENDING_APPROVAL`   |
| `ACTIVE`  | `DELIVERY_CONFIRMED` |
| `RETURN`  | `RETURN_PENDING`     |

ค่าเก่าเหล่านี้ไม่มีสีแยกของตัวเอง (ไม่ใช่ Cyan/Blue ตามที่เอกสารรุ่นก่อนเคยระบุผิด) CSS class `.calendar-legend__pending` (cyan) และ `.calendar-legend__active` (blue) เป็น dead code ในโค้ดปัจจุบัน ไม่เคยถูกเรียกใช้จริง — ควรลบออกเมื่อมีโอกาส refactor calendar CSS

Filter option บน Calendar (status filter) ใช้เฉพาะ 10 canonical status เท่านั้น ค่าเก่าไม่มี filter option แยกของตัวเอง — เลือก `PENDING_APPROVAL`, `DELIVERY_CONFIRMED` หรือ `RETURN_PENDING` จะครอบคลุมค่าเก่าที่เกี่ยวข้องไปด้วย

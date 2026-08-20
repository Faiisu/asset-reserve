# Acceptance criteria

[← กลับไปสารบัญ](README.md)

เกณฑ์ยอมรับเชิงฟังก์ชัน (business-level) แยกตาม domain เกณฑ์เชิง non-functional (performance, infra) อยู่ใน [backend_spec/testing-strategy.md](../backend_spec/testing-strategy.md); test matrix/automation อยู่ใน [frontend_spec/ui-states-and-accessibility.md](../frontend_spec/ui-states-and-accessibility.md) และ backend testing strategy

## Authentication / access

- ผู้ไม่ login ถูก redirect ไป `/login`
- User ที่ `isActive = false` ใช้งาน protected route ไม่ได้
- Navigation และ action ที่แสดงสอดคล้องกับ permissions และ management-area scope ของผู้ใช้
- Backend ตอบ `403` เมื่อเรียก action นอก scope โดยตรง (ไม่พึ่งการซ่อนปุ่มฝั่ง frontend)

## Assets / ledger

- Asset list แสดง total และ available quantity ถูกต้อง
- สร้าง asset พร้อมระบุ management area ได้
- ชื่อ asset ซ้ำในระบบ management area เดียวกันถูกปฏิเสธ
- Asset ที่ deactivate แล้วไม่สามารถถูกเพิ่มในการจองใหม่ได้
- การ register/retire หลาย unit พร้อมกันบันทึกเป็น batch เดียว
- Adjustment ไม่ทำให้ `totalQuantity` ติดลบ

## Reservation

- หนึ่ง Reservation มีหลาย item และกำหนด quantity ต่อ item ได้
- Asset เดิมซ้ำใน Reservation เดียวกันไม่ได้
- `endAt` ต้องมากกว่า `startAt`
- Submit ตรวจ available quantity ซ้ำที่ backend เสมอ แม้ frontend ตรวจมาก่อนแล้ว
- อนุมัติราย item แล้ว aggregate status ของ reservation ถูกคำนวณถูกต้องตามที่ระบุใน [lifecycle-and-state-machines.md](lifecycle-and-state-machines.md)
- Prepare/checkout บันทึก actor และเวลาที่ดำเนินการ
- Participant เดิมเพิ่มซ้ำไม่ได้
- การแก้ Reservation หลัง submit ใช้ change request เท่านั้น

## Return

- Return เลือกได้เฉพาะ item ที่ checkout แล้วและยังคืนไม่ครบ
- จำนวน returned/broken/lost ไม่ติดลบและไม่เกินยอดค้างคืน
- Return approval บันทึก approver และ `decidedAt`
- คืนครบแล้ว item เป็น `RETURNED`
- คืนครบทุก checkout item แล้ว Reservation เป็น `COMPLETED`

## System-level (คร่อม backend/frontend)

- ผู้ใช้สองคน prepare/checkout asset เดียวกันพร้อมกัน มีเพียงฝ่ายเดียวที่ lock asset unit (serial number) นั้นได้สำเร็จ อีกฝ่าย fail ด้วย `409`
- Transaction conflict ถูก retry ตาม policy และตอบ structured `409` เมื่อไม่สามารถดำเนินการได้
- Double click หรือ network retry ไม่สร้าง reservation, approval, ledger หรือ return ซ้ำ
- ทุก list endpoint บังคับ page-size limit
- Backup และ restore procedure ถูกทดสอบอย่างน้อยหนึ่งครั้งก่อน pilot deployment

รายละเอียด implementation ของเกณฑ์ system-level เหล่านี้ (transaction, retry policy, connection pool ฯลฯ) อยู่ใน [backend_spec/database-and-concurrency.md](../backend_spec/database-and-concurrency.md) และ [backend_spec/testing-strategy.md](../backend_spec/testing-strategy.md)

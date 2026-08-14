# Quality and testing

[← กลับไปสารบัญ](../README.md)

## Loading, empty, error และ responsive states

ทุกหน้าที่อ่านข้อมูลต้องมี:

- Loading/skeleton ที่ไม่ทำให้ layout กระโดด
- Empty state พร้อม next action ตาม permission
- Retry เมื่อโหลดล้มเหลว
- Unauthorized และ forbidden state แยกกัน
- Loading/disabled state บน mutation button
- ป้องกัน double submit
- Refresh/revalidate หลัง mutation
- Confirmation dialog สำหรับ cancel, deactivate และ inventory adjustment

Responsive:

- Desktop ใช้ sidebar และ content สูงสุดประมาณ 1500 px
- Tablet วาง panel ต่อกันในแนวตั้ง
- Mobile ใช้ bottom navigation และ form หนึ่งคอลัมน์
- Table ต้องมี mobile card representation สำหรับข้อมูลสำคัญ
- Calendar อนุญาต horizontal scroll เมื่อพื้นที่ไม่พอ

## Acceptance criteria ขั้นต่ำ

### Authentication/access

- ผู้ไม่ login ถูก redirect ไป /login
- User inactive ใช้งาน protected route ไม่ได้
- Navigation และ action สอดคล้องกับ permissions และ management-area scope
- Backend ตอบ 403 เมื่อเรียก action นอก scope โดยตรง

### Assets/ledger

- Asset list แสดง total และ available quantity
- สร้าง asset ด้วย management area และ optional template ได้
- ชื่อ asset ซ้ำใน management area เดียวกันถูกปฏิเสธ
- Deactivate แล้ว asset ไม่สามารถถูกเพิ่มใน reservation ใหม่
- Adjustment หลาย line บันทึกเป็น batch เดียว
- Adjustment ไม่ทำให้ totalQuantity ติดลบ

### Reservation

- หนึ่ง Reservation มีหลาย item และกำหนด quantity ต่อ item ได้
- asset เดิมซ้ำใน Reservation เดียวกันไม่ได้
- endAt ต้องมากกว่า startAt
- Submit ตรวจ available quantity ซ้ำที่ backend
- อนุมัติราย item แล้ว aggregate status ถูกต้อง
- Prepare/check out บันทึก actor และเวลา
- Participant เดิมเพิ่มซ้ำไม่ได้
- การแก้ Reservation หลัง submit ใช้ change request

### Return

- Return เลือกได้เฉพาะ item ที่ checkout และยังคืนไม่ครบ
- จำนวน returned/broken/lost ไม่ติดลบและไม่เกินยอดค้างคืน
- Return approval บันทึก approver และ decidedAt
- คืนครบแล้ว item เป็น RETURNED
- คืนครบทุก checkout item แล้ว Reservation เป็น COMPLETED

### UX quality

- Theme คงอยู่หลัง reload
- Keyboard focus มองเห็น
- Mobile navigation ใช้งานได้
- Status label/สีสอดคล้องกันทุกหน้า
- Server error ไม่ทำให้ข้อมูลใน form หาย

## Automated frontend test matrix

1. Protected-route redirect และ login สำเร็จ/ล้มเหลว
2. Permission-aware navigation และ management-area scope
3. Asset list filter และ available quantity
4. Create/edit/deactivate asset
5. Multi-line inventory adjustment
6. Calendar renders multi-day Reservation
7. Create draft Reservation หลาย item พร้อม quantity
8. Submit และ insufficient-quantity conflict
9. Approve/reject ราย item และ aggregate status
10. Prepare และ check out บันทึก actor/time
11. Create/review ReservationChangeRequest
12. Partial return พร้อม returned/broken/lost
13. Approve/reject return
14. User/role assignment และ duplicate-scope validation
15. Responsive navigation และ keyboard accessibility

Test ที่สร้างข้อมูลต้องใช้ fixture เฉพาะ test และล้างข้อมูลใน teardown เสมอ

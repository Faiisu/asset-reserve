# UI states & accessibility

[← กลับไปสารบัญ](README.md)

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

## Responsive design

- Desktop ใช้ sidebar และ content สูงสุดประมาณ 1500 px
- Tablet วาง panel ต่อกันในแนวตั้ง
- Mobile ใช้ bottom navigation และ form หนึ่งคอลัมน์
- Table ต้องมี mobile card representation สำหรับข้อมูลสำคัญ
- Calendar อนุญาต horizontal scroll เมื่อพื้นที่ไม่พอ

## UX quality

- Theme คงอยู่หลัง reload
- Keyboard focus มองเห็น
- Mobile navigation ใช้งานได้
- Status label/สีสอดคล้องกันทุกหน้า (ดู [status-color-mapping.md](status-color-mapping.md))
- Server error ไม่ทำให้ข้อมูลใน form หาย

Acceptance criteria เชิง business rule (เช่น "adjustment ไม่ทำให้ totalQuantity ติดลบ") และ automated test matrix อยู่ใน [software_spec/acceptance-criteria.md](../software_spec/acceptance-criteria.md) — เอกสารนี้ครอบคลุมเฉพาะ UI state/interaction requirement

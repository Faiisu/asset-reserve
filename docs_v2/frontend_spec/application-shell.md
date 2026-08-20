# Application shell

[← กลับไปสารบัญ](README.md)

## Global application shell

### Desktop

- Sidebar: Calendar (เสมอ), Assets, Reservations, Approval request — **ไม่มี "Returns" เป็นรายการ nav แยก** return workflow อยู่ในหน้า reservation detail รายการใดแสดงตามสิทธิ์ของ session ดู [software_spec/permissions-and-rbac.md](../software_spec/permissions-and-rbac.md) สำหรับ permission key ที่ควบคุมแต่ละรายการ
- Admin section มี 4 รายการ: Workspaces (`/admin/areas`), Access and roles (`/admin/access`), Users (`/admin/users`), Notification (`/admin/notifications`) — เข้าถึงได้ตาม permission เดียวกัน
- Top bar แสดง search เฉพาะ asset/reservation, theme switch และ session profile
- Profile แสดง UserProfile.name; ถ้าไม่มี profile ให้ fallback เป็น User.email แล้วจึงเป็นข้อความ "User" เป็นค่าสุดท้าย (email เป็น nullable เพราะ login ปัจจุบันใช้ username; profile chip ในเมนูแสดง email หรือ username ถ้าไม่มี email)
- แสดง role และ management-area scope จาก session จริง ห้าม hardcode

### Mobile

- ใช้ bottom navigation ตามรายการเดียวกับ desktop sidebar (Calendar, Assets, Reservations, Approval request) — ไม่มี "Returns" เช่นกัน
- ซ่อนเมนูที่ไม่มี permission
- เนื้อหาต้องมี bottom padding ไม่ให้ navigation ทับ

### Visual language

- Body/display font: Instrument Sans หรือ sans-serif ใกล้เคียง
- Utility/data font: IBM Plex Mono สำหรับ UUID, วันเวลา และจำนวน
- Color token ทั้งหมดต้องดึงจาก [design-system.html](design-system.html) เท่านั้น — ห้าม hardcode hex value หรือ restate รายชื่อ token ในหน้าอื่นหรือในเอกสารนี้ (SSOT ของสีคือ design-system.html)
- ใช้ semantic tokens ที่รองรับ light/dark theme
- สีต้องไม่เป็นวิธีเดียวที่ใช้สื่อสถานะ

### Accessibility

- Interactive controls ใช้ keyboard ได้และมี visible focus
- Icon-only button มี accessible name
- Form error สำคัญใช้ role=alert และเชื่อมกับ field
- Dialog มี label, modal semantics และคืน focus เมื่อปิด
- รองรับ prefers-reduced-motion

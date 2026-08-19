# Application shell

[← กลับไปสารบัญ](../README.md)

## Global application shell

### Desktop

- Sidebar: Calendar (เสมอ), Assets (`asset:view`), Reservations (`reservation:create`/`update`/`view` อย่างน้อยหนึ่งค่า), Approval request (`reservation:approve`/`reject`) — **ไม่มี "Returns" เป็นรายการ nav แยก** return workflow อยู่ในหน้า reservation detail
- Admin section (Global ADMIN/`user:*` แล้วแต่รายการ) มี 4 รายการ: Workspaces (`/admin/areas`), Access and roles (`/admin/access`), Users (`/admin/users`), Notification (`/admin/notifications`)
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
- Token ทั้งหมดด้านล่างต้องตรงกับ [`detail/design-system.md`](design-system.md) §3 ทุกค่า (SSOT ของสี):
  - Background/canvas: `--canvas` `#eef3f5`
  - Surface: `--surface` `#ffffff`
  - Primary ink: `--ink` `#10213a`
  - Primary blue: `--blue` `#225be2`
  - Success/info: `--teal` `#087a70`
  - Warning: `--amber` `#b95b0c`
  - Error: `--red` `#b93644`
- ใช้ semantic tokens ที่รองรับ light/dark theme
- สีต้องไม่เป็นวิธีเดียวที่ใช้สื่อสถานะ

### Accessibility

- Interactive controls ใช้ keyboard ได้และมี visible focus
- Icon-only button มี accessible name
- Form error สำคัญใช้ role=alert และเชื่อมกับ field
- Dialog มี label, modal semantics และคืน focus เมื่อปิด
- รองรับ prefers-reduced-motion

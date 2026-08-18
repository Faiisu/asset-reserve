# Application shell

[← กลับไปสารบัญ](../README.md)

## Global application shell

### Desktop

- Sidebar: Calendar, Assets, Reservations และ Returns
- Admin section แสดง Users และ Management areas ตาม permission
- Top bar แสดง search เฉพาะ asset/reservation, theme switch และ session profile
- Profile แสดง UserProfile.name; หากไม่มี profile ให้ fallback เป็น User.email
- แสดง role และ management-area scope จาก session จริง ห้าม hardcode

### Mobile

- ใช้ bottom navigation สำหรับ Calendar, Assets, Reservations และ Returns
- ซ่อนเมนูที่ไม่มี permission
- เนื้อหาต้องมี bottom padding ไม่ให้ navigation ทับ

### Visual language

- Body/display font: Instrument Sans หรือ sans-serif ใกล้เคียง
- Utility/data font: IBM Plex Mono สำหรับ UUID, วันเวลา และจำนวน
- Background: #f3f6f8
- Surface: #ffffff
- Primary ink: #172033
- Primary blue: #2563eb
- Success: #17846d
- Warning: #b55b0a
- Error: #c33c45
- ใช้ semantic tokens ที่รองรับ light/dark theme
- สีต้องไม่เป็นวิธีเดียวที่ใช้สื่อสถานะ

### Accessibility

- Interactive controls ใช้ keyboard ได้และมี visible focus
- Icon-only button มี accessible name
- Form error สำคัญใช้ role=alert และเชื่อมกับ field
- Dialog มี label, modal semantics และคืน focus เมื่อปิด
- รองรับ prefers-reduced-motion

# Design System & UI Baseline

[← กลับไปสารบัญ](README.md)

**Canonical artifact: [`design-system.html`](design-system.html)** — เปิดไฟล์นี้บน browser เพื่อดู typography, color tokens, spacing scale และ component specimen แบบ interactive พร้อมปุ่มสลับ Light/Dark theme ค่าตัวเลขและสีทั้งหมด (font size, color hex, spacing) มีที่เดียวคือใน `.html` นี้ — เอกสารฉบับนี้เป็นเพียงคำอธิบายภาพรวมเชิง prose ไม่ restate ค่าตัวเลข ถ้าเนื้อหาสองไฟล์ขัดกันให้ยึด `.html` เป็นหลัก

## ภาพรวมระบบ

Design system ของ Asset Reservation ประกอบด้วย:

1. **Typography hierarchy** — ใช้ Instrument Sans สำหรับ heading/body และ IBM Plex Mono สำหรับข้อมูลเชิงตัวเลข (UUID, จำนวน, วันเวลา, eyebrow label)
2. **Color tokens** — ชุดสี semantic (ink, canvas, surface, blue, teal, amber, red, green, purple) รองรับ light/dark theme สีต้องไม่ใช่วิธีเดียวที่สื่อสถานะ (ต้องมี label กำกับเสมอ)
3. **Availability badge rules** — ป้ายบอกความพร้อมของ asset (Green = full stock, Amber = partial, Red = zero stock) พร้อมกฎการปิดใช้งานการ์ดเมื่อ fully booked
4. **Spacing scale** — grid มาตรฐาน 4px/8px ควบคุม padding/gap ของทุก component เพื่อไม่ให้เกิดค่า arbitrary
5. **Page pattern archetypes** — 6 รูปแบบหน้าจอหลักที่ทุกหน้าประกอบขึ้นจาก: Interactive Board, List & Ledger, Entity Detail, Compose & Form, Admin & Matrix, Auth & Session Gate

รายละเอียดทั้งหมดของแต่ละหัวข้อ (ค่า font-size, hex code, breakpoint, ตัวอย่าง component) อยู่ใน [`design-system.html`](design-system.html) เท่านั้น

## การใช้งานอ้างอิง

เอกสารอื่นใน `frontend_spec/` ที่ต้องการอ้างถึง token สี/ตัวอักษร (เช่น [application-shell.md](application-shell.md), [status-color-mapping.md](status-color-mapping.md)) ให้ลิงก์มาที่ไฟล์นี้หรือ `design-system.html` โดยตรง ห้าม re-list ค่าตัวเลขซ้ำ

# Design System & UI Baseline

[← กลับไปสารบัญ](../README.md) · [🌐 เปิด Interactive HTML Design Guide (design-system.html)](../design-system.html)

เอกสารนี้รวบรวมข้อกำหนดการออกแบบ (Design Tokens, Typography Hierarchy, Component Patterns, Availability Colors) สำหรับการพัฒนา UI ในระบบ Asset Reservation

> 💡 **หมายเหตุ**: สามารถเปิดไฟล์ [`docs/frontend_spec/design-system.html`](../design-system.html) บน Browser เพื่อดูตัวอย่าง UI สดและการแสดงผลแบบ Interactive พร้อมปุ่มสลับ Light / Dark theme

---

## 1. Typography Hierarchy

| Level / Element | Font Family | Size | Weight | Tracking / Line Height | Color Token | Usage |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Eyebrow** (`.eyebrow`) | IBM Plex Mono | `11px` (compact: `8.5px`) | `600` | `letter-spacing: 0.11em; text-transform: uppercase` | `var(--blue)` | หัวข้อย่อยระบุหมวดขั้นตอน เช่น `01 / SCHEDULE` |
| **Page Header** (`<h1>`) | Instrument Sans | `clamp(30px, 3vw, 44px)` | `700` | `line-height: 1.05; letter-spacing: -0.045em` | `var(--ink)` | ชื่อหน้าหลัก เช่น Calendar, Assets, Reservations |
| **Page Description** (`.page-header__description`) | Instrument Sans | `14px` | `400` | `line-height: 1.55` | `var(--ink-soft)` | คำอธิบายใต้ชื่อหน้า |
| **Section Header** (`<h2>`) | Instrument Sans | `18px – 22px` | `700` | `line-height: 1.25; letter-spacing: -0.025em` | `var(--ink)` | หัวข้อการ์ด / sidebar panel |
| **Subsection Header** (`<h3>`) | Instrument Sans | `15px – 16px` | `650` | `line-height: 1.35; letter-spacing: -0.015em` | `var(--ink)` | หัวข้อกลุ่มข้อมูล / โมดอล |
| **Body Regular** (`p`, `span`) | Instrument Sans | `13.5px` | `400 / 500` | `line-height: 1.5` | `var(--ink)` | ข้อความทั่วไปและฟอร์ม |
| **Caption / Meta** (`small`) | Instrument Sans | `11.5px` | `500` | `line-height: 1.3` | `var(--ink-soft)` | วันเวลา, สถานะกำกับ, breadcrumb |
| **Data / Numbers** (`code`, `em`) | IBM Plex Mono | `10.5px – 11px` | `600` | `letter-spacing: 0.01em` | ตาม context | จำนวนทรัพย์สิน, UUID, badge ตัวเลข |

---

## 2. Asset Availability Color Coding

สำหรับ Choose Assets และการแสดงสถานะจำนวนคงเหลือของทรัพย์สิน:

- 🟢 **Green (Full Stock)** (`.calendar-asset-option__availability--full`):
  - ใช้งานเมื่อ: `availableQuantity === totalQuantity` (เช่น `10 of 10`)
  - Color: `color: var(--green); background: var(--green-soft);`
- 🟡 **Yellow / Amber (Partial Stock)** (`.calendar-asset-option__availability--partial`):
  - ใช้งานเมื่อ: `availableQuantity > 0 && availableQuantity < totalQuantity` (เช่น `9 of 10`, `3 of 4`)
  - Color: `color: var(--amber); background: var(--amber-soft);`
- 🔴 **Red (Zero Stock / Fully Booked)** (`.calendar-asset-option__availability--none`):
  - ใช้งานเมื่อ: `availableQuantity <= 0` (เช่น `0 of 10` หรือ `Fully booked`)
  - Color: `color: var(--red); background: var(--red-soft);`

---

## 3. Color Tokens

```css
:root {
  --ink: #10213a;
  --ink-soft: #4f6074;
  --ink-faint: #748296;
  --canvas: #eef3f5;
  --surface: #ffffff;
  --surface-raised: #f8fafb;
  --line: #d7e0e5;
  --line-strong: #bdcad2;

  --blue: #225be2;
  --blue-soft: #e9efff;
  --teal: #087a70;
  --teal-soft: #dff4ef;
  --amber: #b95b0c;
  --amber-soft: #fff0d9;
  --red: #b93644;
  --red-soft: #fde9ec;
  --green: #267447;
  --green-soft: #e4f4e9;
}
```

---

## 4. Page Section Layout Patterns

| Pattern | Selector / Container | Layout Type | Usage & Purpose |
| :--- | :--- | :--- | :--- |
| **Page Stack** | `.page-stack` | Flex Column, `gap: 24px` | คอนเทนเนอร์หลักของทุกหน้า (Form pages ใช้ `.page-stack--form` กำหนด `max-width: 1320px`) |
| **Page Header** | `.page-header` | Flex Space-Between, `align-items: flex-end` | ส่วนหัวของหน้า ประกอบด้วย Breadcrumb, H1 Title, Description และ Action buttons ทางขวา |
| **Filter Toolbar** | `.toolbar` | Flex `min-height: 66px`, `gap: 12px`, Border & Surface | แถบเครื่องมือสำหรับค้นหา (`.search-box`), Dropdown filters และปุ่ม Action |
| **2-Column Split Workspace** | `.calendar-workspace`, `.record-form` | Grid `minmax(0, 1fr) [320px-360px]`, `gap: 12px` | หน้ารายการแบบ 2 คอลัมน์ (เช่น Calendar board ซ้าย + Choose assets manifest ขวา) |
| **Data Table Wrap** | `.data-table-wrap`, `.data-table` | Bordered Card + HTML Table | ตารางข้อมูลหลัก (Header mono uppercase 9px, Row hover effect, Status chips, Checkbox) |
| **Card / Panel** | `.card`, `.panel`, `.demo-box` | Surface Card, Border `1px solid var(--line)`, Radius `14px` | การ์ดแยกกลุ่มเนื้อหา พร้อมส่วนหัว Eyebrow + H2/H3 |
| **Notice & Alert Banners** | `.notice`, `.error-state` | Flex `padding: 12px 16px`, Radius `9px` | แถบแจ้งเตือนสถานะ (Teal: Success/Info, Amber: Warning, Red: Error) |

---

## 5. Page Patterns (Archetypes)

ระบบ Asset Reservation ถูกออกแบบตาม 6 รูปแบบหน้าจอหลัก (Page Archetypes):

```text
1. Interactive Board Pattern     2. List & Ledger Pattern         3. Entity Detail Pattern
   ┌─────────────────┬──────┐       ┌────────────────────────┐       ┌────────────────────────┐
   │ Controls & Grid │ Picker│       │ Page Header + Actions  │       │ Hero (Title+Status+CTA)│
   │ Month Schedule  │ Live │       ├────────────────────────┤       ├───────────┬────────────┤
   │ Continuous view │ Qty  │       │ Toolbar (Search/Filter)│       │ Item List │ Timeline & │
   │                 │      │       ├────────────────────────┤       │ Breakdown │ Audit Logs │
   │                 │      │       │ Data Table / Ledger    │       │ Approvals │ Scope Info │
   └─────────────────┴──────┘       └────────────────────────┘       └───────────┴────────────┘

4. Compose & Form Pattern        5. Admin & Matrix Pattern        6. Auth & Session Gate
   ┌─────────────────┬──────┐       ┌────────────────────────┐       ┌────────────────────────┐
   │ Form Inputs     │ Live │       │ Overview Stats & Scope │       │                        │
   │ Details, Dates, │ Order│       ├───────────┬────────────┤       │     [Login Card]       │
   │ Batch Rows      │ Pre- │       │ Role Card │ Permission │       │     Email & Pass       │
   │ Selection List  │ view │       │ Matrix    │ Toggles    │       │     Submit CTA         │
   └─────────────────┴──────┘       └───────────┴────────────┘       └────────────────────────┘
```

### รายละเอียดโครงสร้างแต่ละ Page Pattern:

1. **Interactive Workspace / Board Pattern** (เช่น `CalendarPage`):
   - **เป้าหมาย**: มองเห็นภาพรวม timeline ของการจองและเช็คความพร้อมของอุปกรณ์แบบเรียลไทม์
   - **โครงสร้าง**:
     - Left Rail (`1fr`): Month navigation, today jump, area/status filters, continuous month calendar board, weekday headers, event minibox actions.
     - Right Aside (`360px`): Choose assets manifest, search box, live availability badges (Green/Yellow/Red), quick booking CTA.

2. **List & Data Ledger Pattern** (เช่น `AssetsPage`, `ReservationsPage`, `UsersPage`):
   - **เป้าหมาย**: จัดการและค้นหารายการข้อมูลจำนวนมาก รองรับการเลือกแบบ batch selection
   - **โครงสร้าง**:
     - `.page-header` + `.toolbar` (Search, Area filter, Status dropdown)
     - `.selection-bar` แสดงเมื่อมีแถวถูกเลือกสำหรับ batch operations
     - `.data-table-wrap` (Table headers แบบ mono uppercase 9px, thumbnail 44px, status badges, actions)
     - `.load-more` สำหรับ pagination

3. **Entity Detail & Lifecycle Review Pattern** (เช่น `AssetDetailPage`, `ReservationDetailPage`):
   - **เป้าหมาย**: ดูรายละเอียดเชิงลึกของแต่ละ entity พร้อมทำขั้นตอนอนุมัติ (Approval / Decision flow)
   - **โครงสร้าง**:
     - Detail Hero Card: แสดงชื่อ entity, สถานะ badge ใหญ่, key attributes (ผู้จอง, ช่วงเวลา, area) และ action buttons (Approve, Reject, Cancel, Edit)
     - Content Breakdown: รายการ asset พร้อมสถานะการอนุมัติรายชิ้น, รายชื่อผู้เข้าร่วม, และ timeline audit log

4. **Compose & Multi-Step Form Pattern** (เช่น `ReservationCreatePage`, `AssetFormPage`):
   - **เป้าหมาย**: สร้างหรือแก้ไขข้อมูล รองรับการกรอกข้อมูลและเลือกอุปกรณ์แบบ interactive
   - **โครงสร้าง**:
     - Form container (`.page-stack--form` max-width 1320px)
     - Split Form Workspace: ด้านซ้ายเป็น Form Inputs / Schedule Date Pickers / Batch Row Editor; ด้านขวาเป็น Live Manifest Summary & Validation

5. **Administration & Matrix Pattern** (เช่น `AccessPage`, `ManagementAreasPage`):
   - **เป้าหมาย**: กำหนดสิทธิ์ Role-Permission matrix และโครงสร้าง Management Area
   - **โครงสร้าง**:
     - `.access-overview` สรุปจำนวน roles และ users
     - Role cards พร้อมรายการสิทธิ์ (Capabilities) ที่เปิด/ปิดได้ตาม permission scope
     - Dialog popup สำหรับสร้าง/แก้ไข Role หรือ Area

6. **Authentication & Session Gate Pattern** (เช่น `LoginPage`):
   - **เป้าหมาย**: ยืนยันตัวตนก่อนเข้าใช้งาน
   - **โครงสร้าง**:
     - การ์ดกึ่งกลางหน้าจอ (`.login-card`) แสดงโลโก้, ฟอร์มล็อกอิน, demo user switches สำหรับทดสอบบทบาท, และปุ่ม Sign In



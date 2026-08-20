# Assets and inventory

[← กลับไปสารบัญ](../README.md)

## Asset inventory

Asset คือ catalog/part-number entry ใน management area (ไม่ใช่ตัวเครื่องจริง) `totalQuantity` เป็นค่าที่ backend derive จากการนับ `AssetUnit` — ไม่ใช่ field ที่แก้ไขตรงได้ รายละเอียด data model ดู [backend_spec/database-schema.md](../../backend_spec/database-schema.md)

### Asset list

**View Tabs (`.asset-view-tabs`):**

- **All assets** (`view === "ALL"`): แสดงรายการทรัพย์สินทั้งหมดที่ผู้ใช้มีสิทธิ์เข้าถึงใน management areas
- **My assets** (`view === "MINE"`): แสดงเฉพาะทรัพย์สินที่ผู้ใช้เป็นผู้สร้าง/เจ้าของ หรือมีสิทธิ์จัดการ/แก้ไข

**Sorting:**

- จัดเรียงตามบทบาทและสิทธิ์ของผู้ใช้ โดยแสดง **Editable assets ก่อน** ตามด้วย Read-only assets
- ภายในกลุ่มเดียวกัน จัดเรียงตาม `updatedAt` ล่าสุดก่อน

แสดง:

- pictureUrl หรือ placeholder
- name
- description
- ManagementArea.name
- totalQuantity
- isActive

(`availableQuantity` มีอยู่ใน API response แต่ไม่ถูก render ในหน้านี้ — availability เป็น schedule-based ดูได้จาก Calendar แทน)

Filter:

- Search จาก name/description
- Management area
- Active/Inactive (`isActive` boolean บน `Asset` เอง — ไม่ใช่ `AssetUnitStatus` ระดับ unit อย่าง `BROKEN`/`LOST`; `GET /assets` ไม่มี query param สำหรับกรองด้วย unit status)

ชื่อ asset ต้อง unique ภายใน management area เดียวกัน — validation rule เต็ม (field length, uniqueness scope) ดู [software_spec/business-rules-and-validation.md](../../software_spec/business-rules-and-validation.md)

### Asset details

แสดง:

- รูป ชื่อ และคำอธิบาย
- Management area
- Total quantity (นับจาก `AssetUnit` ที่ active, read-only)
- Reservation items ที่กำลังใช้งาน
- Unit event ledger: serial number, event type, from/to status, reason, batch description, ผู้ดำเนินการ — เรียง createdAt ล่าสุดก่อน (`asset.unitEventLedger`)
- ปุ่ม Edit เมื่อมีสิทธิ์แก้ไข asset
- ปุ่ม Deactivate/Activate ตาม permission และ isActive
- ปุ่ม Register units (ตาม `capabilities.canManageUnits`) — เปิด dialog กรอก serial number ทีละบรรทัด
- ปุ่ม Request this asset เมื่อ active และมีสิทธิ์สร้าง reservation

ไม่มี tag, category, location, current holder หรือ due-back ระดับ asset เพราะ Prisma ไม่ได้เก็บข้อมูลเหล่านี้ (condition ต่อหน่วยมีจริงใน `ReturnItemUnit.condition` ตอน return แต่ไม่แสดงในหน้านี้)

**Gap (as-built, ไม่ใช่ spec):** ปัจจุบันไม่มี UI สำหรับปลดระวาง unit หรือแก้ status ทีละ unit — ดูรายละเอียดที่ [status/implementation-status.md](../../status/implementation-status.md)

### Create/Edit asset

Field:

| Field            | Required | หมายเหตุ UI                                        |
| ----------------- | -------- | --------------------------------------------------- |
| name              | Yes      | validation rule เต็มดู software_spec (ลิงก์ด้านล่าง) |
| managementAreaId  | Yes      | เลือกจาก area ที่ actor มีสิทธิ์เท่านั้น             |
| description       | No       | Text                                                 |
| pictureUrl        | No       | URL จาก `POST /uploads/image`, file picker หรือ camera capture |
| isActive          | Yes      | ค่าเริ่มต้น true                                     |

Field length, uniqueness และ validation error ทั้งหมด ดู [software_spec/business-rules-and-validation.md](../../software_spec/business-rules-and-validation.md)

`totalQuantity` **ไม่ใช่ field ที่แก้ในฟอร์มนี้** — ตอน edit หน้าฟอร์มแสดงเป็น input `disabled` พร้อม hint "Register or retire serial units from the asset details page" การเพิ่มจำนวนทำผ่าน "Register units" dialog (asset list หรือ asset details) เท่านั้น

First draft upload รูปเข้า local backend storage โดยตรง รองรับ file picker และ camera capture, จำกัดหนึ่งไฟล์ไม่เกิน 10 MiB ต่อ request และเก็บ URL ใน `Asset.pictureUrl`

Deactivate ใช้ Asset.isActive=false ไม่ hard delete เพื่อรักษา relation และ ledger

## Unit registration and the unit event ledger

`AssetUnitEventBatch` รวม unit event หลายรายการที่เกิดจาก action เดียว (เช่น register ครั้งเดียวหลาย serial) ไม่มี quantity field ให้บวกลบ มีแต่ unit แต่ละตัวที่เปลี่ยน status

### Register units dialog (asset list แบบ batch, asset details แบบทีละ asset)

- ไม่มี batch description แยก มีแค่ reason ต่อการ submit หนึ่งครั้ง
- ผู้ใช้กรอก serial number ทีละบรรทัด (คั่นด้วย newline หรือ comma ในหน้า list) ต่อ asset ที่เลือก
- เรียกหนึ่ง request ต่อ asset (ไม่ใช่ batch request เดียวข้าม asset) — API contract เต็มดู [backend_spec/contracts/](../../backend_spec/contracts/README.md)
- `performedBy` มาจาก session ห้ามให้ frontend เลือกผู้ดำเนินการ
- หลังสำเร็จ reload asset list/details

### Unit event ledger (asset details เท่านั้น)

แสดง `asset.unitEventLedger` เป็นตาราง: Time, Event (`eventType`), Serial, Status change (`fromStatus → toStatus`), Reason + batch description, Performed by — เรียง createdAt ล่าสุดก่อน เป็น read-only history ไม่ใช่ฟอร์มปรับยอด

### Gap: ไม่มี retire หรือ manual status-change UI

ดู [status/implementation-status.md](../../status/implementation-status.md) สำหรับรายการ endpoint ที่ backend มีแต่ frontend ยังไม่มี UI เรียก

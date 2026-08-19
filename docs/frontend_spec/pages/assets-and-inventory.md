# Assets and inventory

[← กลับไปสารบัญ](../README.md)

## Asset inventory

Asset คือ catalog/part-number entry ใน management area เช่น “Projector” ไม่ใช่ตัวเครื่องจริง ตัวเครื่องจริงแต่ละชิ้นคือ `AssetUnit` แยกตาม serial number `totalQuantity` ที่ frontend แสดงเป็นค่าที่ backend derive จากการนับ `AssetUnit` ที่ยัง active เท่านั้น ไม่ใช่ field ที่แก้ไขตรงได้อีกต่อไป

### Asset list

**View Tabs (`.asset-view-tabs`):**
- **All assets** (`view === "ALL"`): แสดงรายการทรัพย์สินทั้งหมดที่ผู้ใช้มีสิทธิ์เข้าถึงใน management areas
- **My assets** (`view === "MINE"`): แสดงเฉพาะทรัพย์สินที่ผู้ใช้เป็นผู้สร้าง/เจ้าของ (`asset.owner.id === session.user.id`) หรือมีสิทธิ์จัดการ/แก้ไข (`asset:update` / `asset:delete`)

**Sorting:**
- จัดเรียงตามบทบาทและสิทธิ์ของผู้ใช้ โดยแสดง **Editable assets ก่อน** (ทรัพย์สินที่แก้ไข/จัดการจำนวนได้) ตามด้วย Read-only assets
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
- Statuses (Active, Broken, Lost, Inactive)

ชื่อ asset ต้อง unique ภายใน management area เดียวกัน

### Asset details

แสดง:

- รูป ชื่อ และคำอธิบาย
- Management area
- Total quantity (นับจาก `AssetUnit` ที่ active, read-only)
- Reservation items ที่กำลังใช้งาน
- Unit event ledger: serial number, event type, from/to status, reason, batch description, ผู้ดำเนินการ — เรียง createdAt ล่าสุดก่อน (`asset.unitEventLedger`)
- ปุ่ม Edit เมื่อมี asset:update
- ปุ่ม Deactivate/Activate ตาม permission และ isActive
- ปุ่ม Register units (`asset:update` ผ่าน `capabilities.canManageUnits`) — เปิด dialog กรอก serial number ทีละบรรทัด แล้วเรียก `POST /assets/:assetId/units`
- ปุ่ม Request this asset เมื่อ active และมี reservation:create

ไม่มี tag, category, location, current holder หรือ due-back ระดับ asset เพราะ Prisma ไม่ได้เก็บข้อมูลเหล่านี้ (condition ต่อหน่วยมีจริงใน `ReturnItemUnit.condition` ตอน return แต่ไม่แสดงในหน้านี้)

**Gap:** ไม่มี UI สำหรับปลดระวาง unit (`POST /assets/units/batch-retire`) หรือแก้ status ทีละ unit (`PATCH /assets/units/:assetUnitId/status`) เลย มีแค่ "Register units" ทางเดียว — ต้องปลดระวางผ่าน API/DB ตรงๆ ถ้าจำเป็น `partNumber` ก็มีอยู่ใน type แต่ไม่มี field ให้ดูหรือแก้ในหน้านี้เช่นกัน

### Create/Edit asset

Field:

| Field            | Required | Rule                                               |
| ---------------- | -------- | -------------------------------------------------- |
| name             | Yes      | สูงสุด 40 ตัวอักษร และ unique ต่อ management area  |
| managementAreaId | Yes      | ต้องอยู่ใน scope ของ actor                         |
| description      | No       | Text                                               |
| pictureUrl       | No       | URL จาก `POST /uploads/image`, file picker หรือ camera capture |
| isActive         | Yes      | ค่าเริ่มต้น true                                   |

`totalQuantity` **ไม่ใช่ field ที่แก้ในฟอร์มนี้** — ตอน edit หน้าฟอร์มแสดงเป็น input `disabled` พร้อม hint "Register or retire serial units from the asset details page" การเพิ่มจำนวนทำผ่าน "Register units" dialog (asset list หรือ asset details) ที่กรอก serial number แล้วเรียก `POST /assets/:assetId/units` เท่านั้น

First draft upload รูปเข้า local backend storage โดยตรง รองรับ file picker และ camera capture, จำกัดหนึ่งไฟล์ไม่เกิน 10 MiB ต่อ request และเก็บ URL ใน `Asset.pictureUrl`

Deactivate ใช้ Asset.isActive=false ไม่ hard delete เพื่อรักษา relation และ ledger

## Unit registration and the unit event ledger

`AssetUnitEventBatch` รวม unit event หลายรายการที่เกิดจาก action เดียว (เช่น register ครั้งเดียวหลาย serial) — แทนที่ `AssetTransactionBatch`/quantity-delta model เดิมทั้งหมด ไม่มี quantity field ให้บวกลบอีกต่อไป มีแต่ unit แต่ละตัวที่เปลี่ยน status

### Register units dialog (asset list แบบ batch, asset details แบบทีละ asset)

- ไม่มี batch description แยก มีแค่ reason ต่อการ submit หนึ่งครั้ง
- ผู้ใช้กรอก serial number ทีละบรรทัด (คั่นด้วย newline หรือ comma ในหน้า list) ต่อ asset ที่เลือก
- Submit เรียก `api.registerAssetUnits(assetId, serialNumbers, reason)` → `POST /assets/:assetId/units` แยกหนึ่ง request ต่อ asset (ไม่ใช่ batch request เดียวข้าม asset)
- Backend สร้าง `AssetUnit` หนึ่งแถวต่อ serial number ด้วย `status = ACTIVE`, ปฏิเสธ (`409`) ถ้า serial ซ้ำกับที่มีในระบบ (unique ทั้งระบบ ไม่ใช่แค่ต่อ asset)
- `performedBy` มาจาก session ห้ามให้ frontend เลือกผู้ดำเนินการ
- หลังสำเร็จ reload asset list/details

### Unit event ledger (asset details เท่านั้น)

แสดง `asset.unitEventLedger` เป็นตาราง: Time, Event (`eventType` เช่น `REGISTERED`), Serial, Status change (`fromStatus → toStatus`), Reason + batch description, Performed by — เรียง createdAt ล่าสุดก่อน เป็น read-only history ไม่ใช่ฟอร์มปรับยอด

### Gap: ไม่มี retire หรือ manual status-change UI

Backend มี `POST /assets/units/batch-retire` และ `PATCH /assets/units/:assetUnitId/status` (เปลี่ยนเป็น `BROKEN`/`LOST`/`IN_REPAIR`/`INACTIVE` ได้ทางแอดมิน) แต่ frontend **ไม่มี** ปุ่มหรือ dialog เรียกสองเส้นนี้เลย — มีแค่ "Register units" ทางเดียว ต้องปลดระวางหรือแก้ status ผิดปกติผ่าน API ตรงๆ

# Assets and inventory

[← กลับไปสารบัญ](../README.md)

## Asset inventory

Asset เป็นทรัพย์สินชนิดหนึ่งใน management area พร้อม totalQuantity เช่น “Projector” จำนวน 8 เครื่อง ไม่ใช่แต่ละเครื่องที่มี tag แยก

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
- computed availableQuantity จาก API
- isActive

Filter:

- Search จาก name/description
- Management area
- Statuses (Active, Broken, Lost, Inactive)

ชื่อ asset ต้อง unique ภายใน management area เดียวกัน

### Asset details

แสดง:

- รูป ชื่อ และคำอธิบาย
- Management area
- Total quantity
- Available quantity ที่ backend คำนวณ
- Reservation items ที่กำลังใช้งาน
- Inventory ledger เรียง createdAt ล่าสุดก่อน
- ปุ่ม Edit เมื่อมี asset:update
- ปุ่ม Deactivate/Activate ตาม permission และ isActive
- ปุ่ม Request this asset เมื่อ active และมี reservation:create

ไม่มี tag, category, location, condition, current holder หรือ due-back ระดับ asset เพราะ Prisma ไม่ได้เก็บข้อมูลเหล่านี้

### Create/Edit asset

Field:

| Field            | Required | Rule                                               |
| ---------------- | -------- | -------------------------------------------------- |
| name             | Yes      | สูงสุด 40 ตัวอักษร และ unique ต่อ management area  |
| managementAreaId | Yes      | ต้องอยู่ใน scope ของ actor                         |
| description      | No       | Text                                               |
| pictureUrl       | No       | URL จาก `POST /uploads/image`, file picker หรือ camera capture |
| totalQuantity    | Yes      | จำนวนเต็มตั้งแต่ 0                                 |
| isActive         | Yes      | ค่าเริ่มต้น true                                   |

First draft upload รูปเข้า local backend storage โดยตรง รองรับ file picker และ camera capture, จำกัดหนึ่งไฟล์ไม่เกิน 10 MiB ต่อ request และเก็บ URL ใน `Asset.pictureUrl`

Deactivate ใช้ Asset.isActive=false ไม่ hard delete เพื่อรักษา relation และ ledger

## Inventory ledger

AssetTransactionBatch รวมการปรับ inventory หลายรายการที่เกิดจาก action เดียว

### Transaction types

- ADD: quantityDelta เป็นบวก
- REMOVE: quantityDelta เป็นลบ
- LOST: quantityDelta เป็นลบ
- BROKEN: quantityDelta เป็นลบ
- RETURN: quantityDelta เป็นบวกเมื่อทำให้ physical quantity เพิ่มจริง
- REPAIR และ ADJUSTMENT: ใช้ค่าบวกหรือลบตามการเปลี่ยนแปลงจริง

### Adjustment form

- มี batch description
- เพิ่ม transaction line ได้หลาย asset
- แต่ละ line มี assetId, transactionType, quantityDelta และ reason
- แสดงค่ารวมก่อนและหลังปรับ
- ห้ามทำให้ Asset.totalQuantity ต่ำกว่า 0
- Submit ครั้งเดียวต้องสร้าง batch, transactions และอัปเดต totalQuantity ใน transaction เดียว
- performedBy มาจาก session ห้ามให้ frontend เลือกผู้ดำเนินการ
- หลังสำเร็จเปิดหน้า ledger หรือ asset details

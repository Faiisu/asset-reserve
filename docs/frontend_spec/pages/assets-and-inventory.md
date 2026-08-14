# Assets and inventory

[← กลับไปสารบัญ](../README.md)

## Asset inventory

Asset เป็นทรัพย์สินชนิดหนึ่งใน management area พร้อม totalQuantity เช่น “Projector” จำนวน 8 เครื่อง ไม่ใช่แต่ละเครื่องที่มี tag แยก

### Asset list

แสดง:

- pictureUrl หรือ placeholder
- name
- description
- AssetTemplate.name ถ้ามี
- ManagementArea.name
- totalQuantity
- computed availableQuantity จาก API
- isActive

Filter:

- Search จาก name/description
- Management area
- Asset template
- Active/inactive

ชื่อ asset ต้อง unique ภายใน management area เดียวกัน

### Asset details

แสดง:

- รูป ชื่อ และคำอธิบาย
- Template
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
| name             | Yes      | สูงสุด 150 ตัวอักษร และ unique ต่อ management area |
| managementAreaId | Yes      | ต้องอยู่ใน scope ของ actor                         |
| assetTemplateId  | No       | เลือกจาก AssetTemplate                             |
| description      | No       | Text                                               |
| pictureUrl       | No       | URL ที่ได้จากระบบ upload ภายนอก                    |
| totalQuantity    | Yes      | จำนวนเต็มตั้งแต่ 0                                 |
| isActive         | Yes      | ค่าเริ่มต้น true                                   |

MVP รับ pictureUrl เท่านั้น การ upload ไฟล์โดยตรงต้องมี storage contract เพิ่มเติมและยังไม่ใช่ persistence ที่ Prisma กำหนด

Deactivate ใช้ Asset.isActive=false ไม่ hard delete เพื่อรักษา relation และ ledger

### Asset templates

Admin/Manager สามารถ:

- ดู template
- สร้าง template ด้วย name และ description
- แก้ไข template
- เลือก template ตอนสร้าง asset

ชื่อ AssetTemplate ต้อง unique ทั้งระบบ

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

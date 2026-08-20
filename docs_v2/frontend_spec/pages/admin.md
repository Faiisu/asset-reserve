# Administration

[← กลับไปสารบัญ](../README.md)

## User และ access administration

### User list/detail

แสดง:

- email
- UserProfile.name
- phoneNumber
- profilePictureUrl
- isActive
- auth providers โดยไม่แสดง providerUserId เต็มถ้าไม่จำเป็น
- roles และ management-area scope
- createdAt/updatedAt

Action ที่ปุ่มนี้เปิดให้ทำ (create user, activate/deactivate, assign/remove role) ควบคุมด้วย permission — รายการ permission key และกฎการมอบ role (เช่น ห้ามมอบ role ซ้ำใน scope เดียวกัน) ดู [software_spec/permissions-and-rbac.md](../../software_spec/permissions-and-rbac.md) `assignedBy` มาจาก session เสมอ

### Management areas

หน้า `/admin/areas` มี search/list/create/edit/delete สำหรับ management area — field validation (name length, uniqueness) และกฎการลบ (area ที่ยังมี asset อยู่จะถูกปฏิเสธ) ดู [software_spec/business-rules-and-validation.md](../../software_spec/business-rules-and-validation.md)

UI แสดง asset count และ user-role count เป็น computed summary ต่อ area และเปิด confirmation dialog ก่อนลบเสมอ

### Roles and permissions

หน้า `/admin/access` แสดง permission catalog แยกตาม resource, สร้าง role ใหม่ และแก้ description/permission set ของ role เดิม ตัว permission catalog เต็มและ business rule ที่เกี่ยวข้องดู [software_spec/permissions-and-rbac.md](../../software_spec/permissions-and-rbac.md)

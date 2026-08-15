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

Action:

- Create user เมื่อมี user:create
- Activate/deactivate เมื่อมี user:disable
- Assign/remove role เมื่อมี role:assign
- ป้องกันการมอบ role ซ้ำใน scope เดียวกัน
- assignedBy มาจาก session

### Management areas

หน้า `/admin/areas` สำหรับ Global ADMIN มี search/list/create/edit/delete สำหรับ:

- name required สูงสุด 150 และ unique
- description optional
- asset count และ user-role count เป็น computed summary

ก่อนลบมี confirmation dialog และ backend ปฏิเสธ area ที่ยังมี asset อยู่ ส่วน role assignment relation อาจทำให้ database ปฏิเสธการลบตาม constraint

### Roles and permissions

หน้า `/admin/access` แสดง permission catalog แยกตาม resource, สร้าง role ใหม่ และแก้ description/permission set ของ role เดิม โดย `user:disable` และ `role:assign` บังคับให้เลือก `user:create` ร่วมด้วย การสร้างและแก้ไขจำกัด Global ADMIN

### สถานะ route ของ templates

`/admin/templates` redirect ไป `/admin/areas` ใน first draft ปัจจุบัน แม้ `TemplatesPage.tsx` และ backend asset-template API ยังอยู่ใน source

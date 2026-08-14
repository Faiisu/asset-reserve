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

MVP ต้องมี list/create/edit สำหรับ:

- name required สูงสุด 150 และ unique
- description optional
- asset count และ user-role count เป็น computed summary

การลบ management area ไม่อยู่ใน MVP เพราะมี relation กับ Asset และ UserRole

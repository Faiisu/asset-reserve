# Access control

[← กลับไปสารบัญ](../README.md)

## Role, permission และ scope

### Role

Role ที่รองรับใน MVP:

| Role    | การใช้งานหลัก                                                           |
| ------- | ----------------------------------------------------------------------- |
| ADMIN   | จัดการระบบ ผู้ใช้ role management area และข้อมูลทั้งหมด                 |
| MANAGER | จัดการ asset และ workflow การจอง/คืนใน management area ที่ได้รับมอบหมาย |
| USER    | ดู asset และสร้าง/แก้ไข reservation ของตนเอง                            |

Role ถูกเก็บเป็นข้อมูลในตาราง Role ไม่ใช่ Prisma enum แต่ชื่อที่ MVP ยอมรับคือ ADMIN, MANAGER และ USER

### Permission keys

Frontend ใช้ permission จาก Role.permissions เพื่อแสดง control:

- asset:create
- asset:view
- asset:update
- asset:delete
- reservation:create
- reservation:update
- reservation:approve
- reservation:reject
- return:approve
- user:create
- user:disable
- role:assign

ห้ามใช้ permission เดิมที่ Prisma ไม่ได้อ้างอิง เช่น asset:read, asset:manage, request:create, handoff:confirm หรือ admin:manage

### Management-area scope

UserRole.managementAreaId มีความหมายดังนี้:

- null = role แบบ global
- มี UUID = role ใช้ได้เฉพาะ ManagementArea นั้น
- ผู้ใช้หนึ่งคนมีได้หลาย role และหลาย management area
- คู่ userId + roleId ต้องไม่ซ้ำภายใน scope เดียวกัน

API session ควรส่ง permissions และ managementAreaIds ที่ backend คำนวณแล้ว Frontend ใช้ข้อมูลนี้เพื่อแสดง navigation และ action แต่ backend ต้องตรวจซ้ำเสมอ

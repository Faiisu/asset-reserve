# Permissions & RBAC

[← กลับไปสารบัญ](README.md)

เอกสารนี้เป็นแหล่งเดียว (single source) สำหรับ role, permission key และ management-area scope semantics เอกสารอื่นที่ต้องอ้างถึง permission ให้ลิงก์มาที่นี่แทนการเขียนซ้ำ persisted shape (`Role.permissions` เป็น JSON array) อยู่ใน [backend_spec/database-schema.md](../backend_spec/database-schema.md)

## 1. Role catalog

Role เก็บเป็นข้อมูลในตาราง `Role` ไม่ใช่ Prisma enum และ**ไม่ได้จำกัดอยู่แค่ชื่อตายตัว** — global `ADMIN` สร้าง role เพิ่มด้วยชื่อกำหนดเองได้ (เช่น `TECHNICIAN`) พร้อมกำหนด permission set เอง ผ่าน `POST /roles`

Built-in role ที่ seed มาให้ตั้งแต่ต้นมี 3 ตัว:

| Role | การใช้งานหลัก |
| --- | --- |
| `ADMIN` | จัดการระบบ ผู้ใช้ role management area และข้อมูลทั้งหมด แบบ global |
| `MANAGER` | จัดการ asset และ workflow การจอง/คืนใน management area ที่ได้รับมอบหมาย |
| `USER` | ดู asset และสร้าง/แก้ไข reservation ของตนเอง |

Role ที่สร้างเพิ่มเองใช้ permission key ชุดเดียวกับ §3 ด้านล่าง ประกอบ permission set เองได้อิสระ ไม่ผูกกับความหมายของ 3 role ข้างต้น

## 2. Actor / permission matrix

| Actor | Permission หลักที่ใช้ | ใครเป็นผู้ขอ | ใครเป็นผู้ดำเนินการ | สิ่งที่ทำได้ |
| --- | --- | :---: | :---: | --- |
| Requester (Borrower) | `reservation:create`, `reservation:update` | ใช่ | ใช่ | สร้าง/submit reservation, ยืนยัน handover, ส่ง return slip, ยกเลิกก่อนรับมอบ |
| Co-Participant | ผูกใน `ReservationParticipant` | ไม่ | ใช่ | ดู reservation, ส่ง return slip แทนผู้ขอได้ |
| Area Manager (Asset Custodian) | `reservation:approve`, `reservation:reject`, `return:approve` (scope ตาม management area) | ไม่ | ใช่ | อนุมัติ/ปฏิเสธ item ในพื้นที่ตน, ปรับจำนวนที่อนุมัติ, ตรวจสภาพอุปกรณ์คืน (Good/Broken/Lost), ตัดสินใจ return |
| Admin | Global | ใช่ | ใช่ | Override ข้าม management area ทั้งหมด, force cancel/approve/inventory correction |

## 3. Permission key catalog

Permission key เป็นค่าคงที่ของ application ไม่ใช่ข้อมูลที่ client สร้างเพิ่มเอง

| Permission | ความหมาย |
| --- | --- |
| `asset:create` | สร้าง asset ใน scope |
| `asset:view` | ดู asset ใน scope |
| `asset:update` | แก้ไข asset ใน scope |
| `asset:delete` | deactivate/delete asset ตาม policy |
| `reservation:create` | สร้าง reservation |
| `reservation:view` | ดู reservation ของผู้ใช้อื่น (ตาม scope ของ area หรือทั้งระบบ — ดู §5) |
| `reservation:update` | แก้ reservation ที่ policy อนุญาต |
| `reservation:approve` | อนุมัติ reservation item ใน scope |
| `reservation:reject` | ปฏิเสธ reservation item ใน scope |
| `return:approve` | ตัดสิน return ใน scope |
| `user:create` | สร้างผู้ใช้ |
| `user:disable` | activate/deactivate ผู้ใช้ |
| `role:assign` | เพิ่มหรือถอด role assignment |

ห้ามใช้ permission key อื่นนอกตารางนี้ (เช่น `asset:read`, `asset:manage`, `request:create`, `handoff:confirm`, `admin:manage` — เป็นชื่อเก่าที่ไม่ตรงกับระบบปัจจุบัน)

การเปลี่ยน permission set ภายใน role อนุญาตเฉพาะผู้ที่มี global `ADMIN` assignment เท่านั้น เพื่อป้องกัน privilege escalation

## 4. Management-area scope semantics

`UserRole.managementAreaId`:

- `null` = role มีผลทั้งระบบ (global)
- มีค่า UUID = role มีผลเฉพาะ `ManagementArea` นั้น
- ผู้ใช้หนึ่งคนมีได้หลาย role และหลาย management area
- คู่ `userId + roleId + managementAreaId` ต้องไม่ซ้ำ (รวมกรณี `managementAreaId = null`)

Effective permission ใน area หนึ่งคือ **union** ของ global permissions และ permissions ที่ผูกกับ area นั้น backend เป็นผู้คำนวณและส่ง effective permissions ให้ frontend ใช้แสดงผลเท่านั้น — frontend ห้ามคำนวณเองและ backend ต้องตรวจ user active, permission และ scope ซ้ำทุก request

## 5. Cross-user visibility rule

การเข้าถึง reservation ของผู้ใช้อื่นถูกควบคุมด้วย permission `reservation:view` โดยเฉพาะ — permission เชิงปฏิบัติการ (`reservation:approve`, `reservation:reject`, `reservation:update`) **ไม่ได้ให้สิทธิ์เห็นข้อมูลข้ามผู้ใช้โดยอัตโนมัติ**

| Permission | Scope | พฤติกรรม |
| --- | --- | --- |
| `reservation:view` (global) | ทั้งระบบ | เห็นและดู reservation ได้ทั้งหมด |
| `reservation:view` (area-scoped) | ต่อ management area | เห็น reservation ที่มี item จาก area นั้น |
| *(ไม่มี)* | — | เห็นเฉพาะ reservation ของตนเอง (ในฐานะ requester หรือ participant) |

Role ที่ต้องการ browse reservation ของผู้อื่นต้องได้รับ `reservation:view` เพิ่มเติม แยกจาก permission เชิงปฏิบัติการ

## 6. Business rules ที่เกี่ยวกับ role/permission

- ห้ามมอบ role ซ้ำใน scope เดียวกัน (คู่ `userId + roleId + managementAreaId` ซ้ำ)
- ห้ามถอด role assignment หรือ deactivate user จนไม่เหลือ active global `ADMIN`
- ห้ามผู้ใช้ deactivate ตัวเอง
- `ADMIN` role ต้องคง permission `user:disable` และ `role:assign` เสมอ แก้ไม่ได้ผ่าน role editor
- แก้ไข `Role.name` ผ่าน API ไม่ได้ใน MVP — แก้ได้เฉพาะ `description` และ `permissions`
- ลบ management area ที่ยังมี asset อยู่ไม่ได้

## เอกสารที่เกี่ยวข้อง

- API/endpoint ที่บังคับใช้กติกาเหล่านี้: [backend_spec/auth-and-permission-api.md](../backend_spec/auth-and-permission-api.md)
- Request/response shape จริง (session context, role, user): [backend_spec/contracts/openapi.yaml](../backend_spec/contracts/openapi.yaml)
- Permission ที่ persisted เป็นข้อมูลจริง: [backend_spec/database-schema.md](../backend_spec/database-schema.md)

# Testing and acceptance

[← Backend specification](../README.md)

## Testing strategy

### Unit tests

- Permission/scope evaluation
- Reservation aggregate status
- Inventory delta validation
- Return quantity validation
- Retry classification

### Integration tests with PostgreSQL

- Prisma constraints และ relations
- Serializable transaction retry
- Concurrent reservation/approval ของ asset เดียวกัน
- Atomic inventory batch
- Partial return และ completion
- Idempotency behavior

ห้ามใช้ SQLite แทน PostgreSQL สำหรับ integration tests ที่ตรวจ locking, isolation, partial indexes หรือ native types

### E2E tests

ใช้ Playwright ตาม [frontend test matrix](../../frontend_spec/detail/quality-and-testing.md)

### Load tests

ใช้ k6 ทดสอบอย่างน้อย:

- Login/read session
- Asset list พร้อม filters/pagination
- Calendar ตาม date range
- Reservation detail
- Concurrent submit/approval ของ asset เดียวกัน
- Return approval

Concept acceptance profile เริ่มต้นคือ 50 concurrent virtual users บน target on-premise hardware ผลลัพธ์ต้องบันทึก hardware, dataset size, pool configuration และ test script เพื่อให้เปรียบเทียบรอบถัดไปได้

## Non-functional requirements

| ID     | Requirement                                                               |
| ------ | ------------------------------------------------------------------------- |
| NFR-01 | Concurrent critical mutations ต้องไม่ทำให้ quantity ติดลบหรือจองเกินจำนวน |
| NFR-02 | Duplicate request ที่ใช้ idempotency key เดิมต้องไม่สร้างข้อมูลซ้ำ        |
| NFR-03 | API read P95 เป้าหมายไม่เกิน 500 ms ภายใต้ concept load profile           |
| NFR-04 | API write P95 เป้าหมายไม่เกิน 1,000 ms โดยไม่รวม file/external I/O        |
| NFR-05 | Backend ต้องไม่สร้าง Prisma connection pool ต่อ request                   |
| NFR-06 | List endpoint ต้องมี bounded page size                                    |
| NFR-07 | ระบบต้อง recover จาก process restart โดยข้อมูล committed ไม่สูญหาย        |
| NFR-08 | Sensitive credentials และ password hashes ต้องไม่ปรากฏใน API/log          |
| NFR-09 | Frontend และ backend ต้อง build/deploy แยกกันได้                          |
| NFR-10 | ระบบต้องติดตั้งได้โดยไม่พึ่ง cloud-managed service                        |

Performance targets ต้องยืนยันบน hardware และ dataset จริง หากไม่ผ่านให้ optimize query/index/payload ก่อนเพิ่ม pool size หรือ infrastructure

## Acceptance criteria

- ผู้ใช้สองคน submit/approve asset เดียวกันพร้อมกันแล้วมีเพียงผลลัพธ์ที่ไม่เกิน available quantity ที่ commit
- Transaction conflict ถูก retry ตาม policy และตอบ structured `409` เมื่อไม่สามารถดำเนินการได้
- Double click หรือ network retry ไม่สร้าง reservation, approval, ledger หรือ return ซ้ำ
- Backend ใช้ PrismaClient singleton และ connection count อยู่ใน configured pool limit
- Frontend static assets ถูกส่งโดย Nginx ไม่ผ่าน NestJS
- Frontend ไม่มี dependency/import จาก Prisma
- OpenAPI สามารถ generate frontend client ได้โดยไม่มี type error
- ทุก list endpoint บังคับ page-size limit
- Raw SQL check constraints อยู่ใน migration จริง
- Integration tests ใช้ PostgreSQL และ concurrency tests ผ่าน
- Docker Compose เริ่ม Nginx, backend และ PostgreSQL พร้อม health checks ได้
- Backup และ restore procedure ถูกทดสอบอย่างน้อยหนึ่งครั้งก่อน pilot deployment

## Required schema decisions before implementation

Prisma ปัจจุบันรองรับ core business models แล้ว แต่ต้องตัดสินใจก่อน implement:

1. เพิ่ม persistent idempotency model หรือกำหนด alternative unique operation token
2. เพิ่ม Session/RefreshToken model หากต้องการ revoke login ทันทีและ persistent login
3. สร้าง raw SQL migration สำหรับ check constraints
4. ยืนยัน UUID generation ว่าทำใน backend หรือใช้ PostgreSQL default
5. เพิ่ม approval-queue indexes หลังยืนยัน query shape

การเปลี่ยน schema ต้องอัปเดต Prisma, migration, software spec, frontend contracts และ tests ในชุดเดียวกัน

## Implementation sequence

1. จัด workspace และสร้าง frontend/backend packages แยกกัน
2. ตั้ง PostgreSQL, Prisma adapter และ PrismaClient singleton
3. สร้าง migrations รวม database check constraints
4. สร้าง NestJS modules, validation, error shape และ OpenAPI
5. ทำ authentication, RBAC และ ManagementArea scope
6. ทำ Asset/Inventory พร้อม atomic transaction
7. ทำ Reservation availability และ Serializable retry utility
8. ทำ approval, prepare และ checkout
9. ทำ return และ ledger completion
10. Generate frontend API client และ implement pages
11. เพิ่ม Nginx และ Docker Compose
12. ทำ integration, concurrency, E2E และ load tests
13. ทำ backup/restore drill ก่อน pilot

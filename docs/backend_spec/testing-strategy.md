# Testing strategy

[← Backend specification](README.md)

Functional acceptance criteria (business-rule assertions) อยู่ที่ [software_spec/business-rules-and-validation.md](../software_spec/business-rules-and-validation.md) — เอกสารนี้ครอบคลุมเฉพาะ test strategy และ non-functional requirements

## Unit tests

- Permission/scope evaluation
- Reservation aggregate status
- Asset unit registration/retirement validation (serial-number uniqueness, part-number scoping, status transitions per [software_spec/lifecycle-and-state-machines.md §7](../software_spec/lifecycle-and-state-machines.md#condition-classification))
- Return per-unit condition validation (GOOD/BROKEN/LOST via `ReturnItemUnit`)
- Retry classification

## Integration tests with PostgreSQL

- Prisma constraints และ relations
- Serializable transaction retry
- Concurrent reservation/approval ของ asset เดียวกัน
- Atomic serial-unit batch registration/retirement (`AssetUnitEventBatch`/`AssetUnitEvent`, up to 200 units per call)
- Partial return และ completion
- Idempotency behavior

ห้ามใช้ SQLite แทน PostgreSQL สำหรับ integration tests ที่ตรวจ locking, isolation, partial indexes หรือ native types

## E2E tests

ใช้ Playwright ตาม [frontend_spec/ui-states-and-accessibility.md](../frontend_spec/ui-states-and-accessibility.md)

## Load tests

ใช้ k6 ทดสอบอย่างน้อย:

- Login/read session
- Asset list พร้อม filters/pagination
- Calendar ตาม date range
- Reservation detail
- Concurrent submit/approval ของ asset เดียวกัน
- Serial เดิมมีหลาย assignment ที่ไม่ทับกันและ availability ต้องนับ serial นั้นครั้งเดียวในช่วงค้นหา
- Cancel กับ handover แข่งกันแล้วต้องมีเพียง lifecycle transition เดียวที่ commit ได้
- Return approval

Concept acceptance profile เริ่มต้นคือ 50 concurrent virtual users บน target on-premise hardware ผลลัพธ์ต้องบันทึก hardware, dataset size, pool configuration และ test script เพื่อให้เปรียบเทียบรอบถัดไปได้

## Non-functional requirements

| ID     | Requirement                                                                                                                                                                                                                         |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NFR-01 | Concurrent critical mutations ต้องไม่สร้าง assignment ที่ช่วงเวลาทับกันบน serial เดียวกัน แต่ต้องรองรับหลาย assignment ที่ช่วงไม่ทับกัน — รายละเอียด locking/constraint ที่ [Database and concurrency](database-and-concurrency.md) |
| NFR-02 | Duplicate request ที่ใช้ idempotency key เดิมต้องไม่สร้างข้อมูลซ้ำ                                                                                                                                                                  |
| NFR-03 | API read P95 เป้าหมายไม่เกิน 500 ms ภายใต้ concept load profile                                                                                                                                                                     |
| NFR-04 | API write P95 เป้าหมายไม่เกิน 1,000 ms โดยไม่รวม file/external I/O                                                                                                                                                                  |
| NFR-05 | Backend ต้องไม่สร้าง Prisma connection pool ต่อ request                                                                                                                                                                             |
| NFR-06 | List endpoint ต้องมี bounded page size                                                                                                                                                                                              |
| NFR-07 | ระบบต้อง recover จาก process restart โดยข้อมูล committed ไม่สูญหาย                                                                                                                                                                  |
| NFR-08 | Sensitive credentials และ password hashes ต้องไม่ปรากฏใน API/log                                                                                                                                                                    |
| NFR-09 | Frontend และ backend ต้อง build/deploy แยกกันได้                                                                                                                                                                                    |
| NFR-10 | ระบบต้องติดตั้งได้โดยไม่พึ่ง cloud-managed service                                                                                                                                                                                  |

Performance targets ต้องยืนยันบน hardware และ dataset จริง หากไม่ผ่านให้ optimize query/index/payload ก่อนเพิ่ม pool size หรือ infrastructure

## Required schema decisions before implementation

Prisma ปัจจุบันรองรับ core business models แล้ว แต่ต้องตัดสินใจก่อน implement:

1. เพิ่ม persistent idempotency model หรือกำหนด alternative unique operation token
2. เพิ่ม Session/RefreshToken model หากต้องการ revoke login ทันทีและ persistent login
3. สร้าง raw SQL migration สำหรับ check constraints
4. ยืนยัน UUID generation ว่าทำใน backend หรือใช้ PostgreSQL default
5. เพิ่ม approval-queue indexes หลังยืนยัน query shape

การเปลี่ยน schema ต้องอัปเดต Prisma, migration, software spec, frontend contracts และ tests ในชุดเดียวกัน

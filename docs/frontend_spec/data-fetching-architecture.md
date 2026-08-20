# Data-fetching architecture

[← กลับไปสารบัญ](README.md)

Frontend ใช้ backend แบบ Hybrid BFF โดยแยก page query ออกจาก domain command แนวคิดสถาปัตยกรรม Hybrid BFF เต็มดู [backend_spec/architecture/hybrid-bff.md](../backend_spec/architecture/hybrid-bff.md) — เอกสารนี้ครอบคลุมเฉพาะฝั่ง frontend consumption pattern

## Frontend rules

- ใช้ generated OpenAPI client ห้ามเขียน client ด้วยมือที่ผูกกับ Prisma shape
- BFF response เป็น read model สำหรับแสดงผลและไม่ใช้เป็น mutation payload โดยอัตโนมัติ
- Mutation payload ใช้ command DTO เฉพาะ operation (shape ดู [backend_spec/contracts/](../backend_spec/contracts/README.md))
- หลัง mutation สำเร็จให้ invalidate BFF query ที่ได้รับผลกระทบ
- Search/date changes ต้อง debounce และ cancel request เก่า
- Calendar ขอเฉพาะ visible range
- หลีกเลี่ยงการเรียก domain endpoints หลายชุดเพื่อประกอบ page หาก BFF มี page endpoint แล้ว
- ห้ามคำนวณ permission, availability หรือ aggregate status เป็น source of truth ใน browser

## Query-key ownership

| Domain             | Query key prefix               | สถานะ (as-built) |
| ------------------- | ------------------------------- | ----------------- |
| Session             | session                         | BFF จริง (`/bff/session`) |
| Calendar            | calendar + range + area         | Domain ตรง (`/reservations`) |
| Assets              | assets + filters                | Domain ตรง (`/assets`) |
| Reservation detail  | reservation + id                | Domain ตรง (`/reservations/:id`) |
| Approval queue      | approval-queue + tab + filters  | Domain ตรง |
| Return detail       | return + id                     | Domain ตรง (`/returns/:id`) |
| Administration      | admin + resource + filters      | Domain ตรง |

คอลัมน์สถานะคือ as-built snapshot (อาจเปลี่ยนเมื่อมีการ implement BFF endpoint เพิ่ม) — รายละเอียดและแผน BFF endpoint ที่ยังไม่ implement ดู [status/implementation-status.md](../status/implementation-status.md) ส่วน query key เองเป็น design rule ใช้ได้แม้ query จะยิงไปที่ domain endpoint ตรงในปัจจุบัน

Mutation ต้อง invalidate เฉพาะ keys ที่เกี่ยวข้อง ไม่ clear query state ทั้ง application

## Error handling

Frontend ต้องรองรับ structured error จากทั้ง BFF และ Domain API ด้วยรูปแบบเดียวกัน (shape และ error code เต็มดู [backend_spec/algorithms-and-validation.md](../backend_spec/algorithms-and-validation.md)) ฝั่ง UI ต้อง map ไปยัง state ต่อไปนี้:

- 401: ไป login หรือ refresh session ตาม policy
- 403: แสดง forbidden state
- 404: แสดง resource not found
- 409: refresh affected BFF data และแสดง conflict
- 422: map fields กลับเข้าฟอร์ม
- 5xx/network: คง input และให้ retry อย่างปลอดภัย

## Acceptance criteria

- Page หลักไม่ต้องยิง request แบบ N+1 เพื่อประกอบข้อมูล
- Frontend ไม่มี direct Prisma import
- BFF read model และ command DTO เป็น type คนละชุด
- Mutation สำเร็จแล้วข้อมูล page ที่เกี่ยวข้องถูก revalidate
- Request เก่าถูก cancel เมื่อ filter/date เปลี่ยนเร็ว
- OpenAPI-generated client typecheck ผ่าน

สถานะการ implement จริงของแต่ละ endpoint (BFF vs domain, implemented/planned) เป็น as-built snapshot ไม่ใช่ design rule — ดู [status/implementation-status.md](../status/implementation-status.md)

# Data-fetching architecture

[← กลับไปสารบัญ](README.md)

Frontend ใช้ backend แบบ Hybrid BFF โดยแยก page query ออกจาก domain command แนวคิดสถาปัตยกรรม Hybrid BFF เต็มดู [backend_spec/architecture/hybrid-bff.md](../backend_spec/architecture/hybrid-bff.md) — เอกสารนี้ครอบคลุมเฉพาะฝั่ง frontend consumption pattern

## Frontend rules

- Request/response type ต้อง derive จาก [`backend_spec/contracts/`](../backend_spec/contracts/README.md) ห้ามเขียน type ด้วยมือที่ผูกกับ Prisma shape — contract เป็นตัวนิยาม boundary ระหว่าง client กับ server การให้ client ถือสำเนา type ที่แก้แยกกันได้ แปลว่า drift จะเงียบจนกว่าจะเจอตอน runtime (ดู §Contract drift)
- BFF response เป็น read model สำหรับแสดงผลและไม่ใช้เป็น mutation payload โดยอัตโนมัติ
- Mutation payload ใช้ command DTO เฉพาะ operation (shape ดู [backend_spec/contracts/](../backend_spec/contracts/README.md))
- หลัง mutation สำเร็จให้ invalidate BFF query ที่ได้รับผลกระทบ
- Search/date changes ต้อง debounce และ cancel request เก่า
- Calendar ขอเฉพาะ visible range
- หลีกเลี่ยงการเรียก domain endpoints หลายชุดเพื่อประกอบ page หาก BFF มี page endpoint แล้ว
- ห้ามคำนวณ permission, availability หรือ aggregate status เป็น source of truth ใน browser

## Contract drift

Client อ่าน YAML ไม่ได้ จึงจำเป็นต้องถือ**สำเนา**ของ constraint ที่ contract กำหนด (เช่น `maxLength` ของแต่ละ field, path ของแต่ละ endpoint) สำเนาที่ไม่มีใครตรวจจะ drift เงียบๆ — เคยเกิดจริงมาแล้วหลายจุด (ช่อง role description ตัดข้อความที่ต่ำกว่าที่ contract อนุญาต, ฟิลด์ email template ไม่ cap เลยแล้วไปพังตอน save)

กติกา:

- **Constraint ทุกตัวที่ UI บังคับ ต้องอยู่ใน [`frontend/src/constants/contract-limits.ts`](../../frontend/src/constants/contract-limits.ts) ที่เดียว** พร้อมระบุว่า mirror field ไหนใน contract — ห้ามเขียนตัวเลขลง `maxLength={...}` ในฟอร์มตรงๆ
- `npm run check:contract` ที่ root เทียบสำเนาเหล่านั้นกับ `dist/openapi.bundle.yaml` แล้ว **fail build เมื่อไม่ตรง** และเทียบ path ทุกเส้นที่ client เรียกว่ามีอยู่ใน contract จริง คำสั่งนี้อยู่ใน `npm run test:all` แล้ว
- แก้ contract แล้วต้องรัน `cd backend && npm run openapi:bundle` ก่อน ไม่งั้น checker จะเทียบกับ bundle เก่า

ยังไม่ใช้ code generator: `openapi-typescript` ประกาศ peer `typescript@^5.x` ขณะที่โปรเจกต์อยู่ TypeScript 7 การฝืนติดตั้งด้วย `--force` เพื่อให้ safety check ทำงาน คือการแลกความเสี่ยงหนึ่งกับอีกอันที่แย่กว่า เมื่อ generator รองรับ TS 7 แล้วค่อยพิจารณาย้าย `types.ts` ไป derive จาก contract โดยตรง ซึ่งจะแทนที่ checker ตัวนี้ได้

## Cache lifetime (security)

กฎกลุ่มนี้เป็น **security requirement ไม่ใช่เรื่อง performance** — ละเมิดข้อไหนถือเป็น defect เสมอ ไม่ว่าจะใช้ query library หรือ state ของ component เอง

- **ข้อมูลที่ต้อง authenticate ถึงจะได้มา ห้ามอยู่นานกว่า session** — เมื่อ logout หรือได้ `401` ทุก cache ของข้อมูลนั้นต้องถูกทิ้ง ไม่ว่าจะเก็บไว้ที่ไหน
- **ห้ามเก็บ response ที่ต้อง authenticate ลง `localStorage`** — `localStorage` อยู่ข้ามการปิดเบราว์เซอร์และข้ามผู้ใช้บนเครื่องเดียวกัน ขณะที่ access token อยู่ใน `sessionStorage` ซึ่งตายพร้อม tab ของเก็บจึงอายุยืนกว่าสิทธิ์ที่ใช้ดึงมันมา
- `localStorage` ใช้ได้เฉพาะ**ค่าที่ไม่ผูกกับผู้ใช้และไม่ได้มาจาก API** เช่น theme (`asset-rail.theme`)
- ข้อมูลที่ผูกกับผู้ใช้แต่จำเป็นต้องข้ามการ navigate ให้ใช้ in-memory state หรือ `sessionStorage` เท่านั้น
- Permission หรือ scope เปลี่ยน ต้องถือว่า cache ที่ derive จากสิทธิ์เดิมใช้ไม่ได้แล้ว

เหตุผลที่ต้องเขียนเป็นกฎ: เคยมีของจริงหลุดมาแล้ว — `asset-rail.recent-reservations` เขียน id/ชื่องาน/เวลา/สถานะของ reservation ลง `localStorage` ค้างอยู่หลัง UI ที่อ่านมันถูกลบไปตอน redesign ข้อมูลจึงอยู่ข้าม logout และข้ามผู้ใช้บนเครื่องเดียวกัน โดยไม่มีหน้าจอไหนได้ประโยชน์ ถูกลบออกแล้ว

## Query-key ownership

| Domain             | Query key prefix               | สถานะ (as-built) |
| ------------------- | ------------------------------- | ----------------- |
| Session             | session                         | BFF จริง (`/bff/session`) |
| Calendar            | calendar + range + area         | Domain ตรง (`/reservations`) |
| Assets              | assets + filters                | Domain ตรง (`/assets`) |
| Reservation detail  | reservation + id                | Domain ตรง (`/reservations/:id`) |
| Approval queue      | approval-queue + tab + filters  | Domain ตรง |
| Return detail       | return + id                     | ฝังมากับ reservation detail (`/reservations/:id` → `returns[]`) — `/returns` และ `/returns/:id` มีใน backend/contract แต่ frontend ยังไม่เรียก |
| Administration      | admin + resource + filters      | Domain ตรง |

คอลัมน์สถานะคือ as-built snapshot (อาจเปลี่ยนเมื่อมีการ implement BFF endpoint เพิ่ม) — รายละเอียดและแผน BFF endpoint ที่ยังไม่ implement ดู [status/implementation-status.md](../status/implementation-status.md)

**ตาราง query-key เป็น design target ไม่ใช่ as-built**: ปัจจุบันยังไม่มี query library ในโปรเจกต์ แต่ละหน้าถือ state เองด้วย `useEffect`/`useState` และ refetch เองหลัง mutation จึงยังไม่มี key ให้ invalidate จริง ตารางนี้กำหนดว่า *ถ้า*รับ query library เข้ามา ownership ควรถูกแบ่งแบบไหน — การตัดสินใจว่าจะรับหรือไม่เป็นเรื่อง architecture/UX ไม่ใช่ security (cache ของ library ก็ต้องอยู่ใต้กฎ Cache lifetime ข้างบนเหมือนกัน และ component-local state ที่ตายตอน unmount เป็น default ที่ปลอดภัยกว่าโดยธรรมชาติ)

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
- Type ของ client ตรงกับ contract และ drift ถูกจับได้ตั้งแต่ build ไม่ใช่ runtime (ดู §Contract drift)
- ไม่มีข้อมูลที่ต้อง authenticate หลงเหลือใน `localStorage` หลัง logout (ดู §Cache lifetime)

สถานะการ implement จริงของแต่ละ endpoint (BFF vs domain, implemented/planned) เป็น as-built snapshot ไม่ใช่ design rule — ดู [status/implementation-status.md](../status/implementation-status.md)

# Asset Reservation — Frontend Design Specification

เอกสารนี้เป็น single source of truth สำหรับ **หลักการออกแบบ component และภาษาการออกแบบ (visual language) ที่ใช้ร่วมกันทั้งระบบ** — typography, color token, component pattern, interaction, accessibility และ responsive rule เท่านั้น **ไม่ลงรายละเอียดพฤติกรรมเฉพาะของแต่ละหน้าจอ** (field ไหนแสดงอยู่หน้าไหน, flow เฉพาะของแต่ละ route ฯลฯ) — รายละเอียดระดับนั้นอ่านจาก source จริง (`frontend/src/pages/`) โดยตรง

**เอกสารนี้ไม่ใช่ที่มาของ business rule, permission model, status enum หรือ API contract** — เรื่องเหล่านั้นอยู่ใน [`../software_spec/`](../software_spec/README.md) และ [`../backend_spec/`](../backend_spec/README.md) เสมอ ดู [cross-reference convention](../README.md) สำหรับหลักการอ้างอิงข้าม spec

เอกสารที่เกี่ยวข้อง:

- [Software specification](../software_spec/README.md) — business rule, lifecycle, permission
- [Backend specification](../backend_spec/README.md) — API contract และ implementation
- [Implemented frontend surface](../status/implementation-status.md) — route และ feature ที่ตรวจจาก source ปัจจุบัน (as-built snapshot ไม่ใช่ spec)

## Documentation structure

| เอกสาร                                                          | เนื้อหา                                        |
| ------------------------------------------------------------ | ---------------------------------------------- |
| [Design System](design-system.md)                             | Typography, Color tokens, Component patterns (canonical: [design-system.html](design-system.html)) |
| [Application shell](application-shell.md)                      | Navigation, visual language, accessibility     |
| [Status → color mapping](status-color-mapping.md)              | สีและ label ของแต่ละ status บน UI              |
| [Data-fetching architecture](data-fetching-architecture.md)    | BFF vs domain endpoint, query-key convention   |
| [UI states & accessibility](ui-states-and-accessibility.md)    | Loading/empty/error state, responsive design   |
| [Engineering conventions](engineering-conventions-frontend.md) | โครงสร้างโฟลเดอร์และ naming convention         |

```text
docs/frontend_spec/
├── README.md
├── design-system.html          # canonical interactive design guide
├── design-system.md            # short prose companion
├── application-shell.md
├── status-color-mapping.md
├── data-fetching-architecture.md
├── ui-states-and-accessibility.md
└── engineering-conventions-frontend.md
```

## Scope boundary

Data model ที่ frontend อ้างอิง (Prisma models ที่เป็นขอบเขตของ MVP) ดูที่ [backend_spec/database-schema.md](../backend_spec/database-schema.md) — frontend ต้องไม่สร้าง field หรือ feature ที่ต้อง persist แต่ไม่มี model รองรับใน schema นั้น

Route table, flow ของแต่ละหน้า, business scope และ MVP ordering (login → calendar → สร้าง reservation → อนุมัติ → checkout → คืน) เป็นรายละเอียดระดับหน้าจอ ไม่ใช่หลักการออกแบบ component — ดู [Implemented frontend surface](../status/implementation-status.md) สำหรับ route table ที่ตรวจจาก source จริง และ [software_spec/lifecycle-and-state-machines.md](../software_spec/lifecycle-and-state-machines.md) สำหรับ state machine/flow

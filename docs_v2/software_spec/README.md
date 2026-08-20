# Asset Reservation — Software Specification

เอกสารชุดนี้เป็น single source of truth สำหรับ **สิ่งที่ระบบต้องทำ** (functional requirements): business rules, lifecycle/state machines, permission/RBAC model, scope และ acceptance criteria

รายละเอียดว่า "จะสร้างอย่างไร" อยู่ใน [backend specification](../backend_spec/README.md) (implementation) และ [frontend specification](../frontend_spec/README.md) (UI/UX design) — เอกสารในชุดนี้ไม่ควรมี API request/response JSON, โค้ด หรือรายละเอียด UI layout ใดๆ หากพบให้แทนที่ด้วยลิงก์ไปยังเอกสารที่เป็นเจ้าของจริง

## เอกสารในชุดนี้

| เอกสาร | เนื้อหา |
| --- | --- |
| [Lifecycle & state machines](lifecycle-and-state-machines.md) | 5-step lifecycle, canonical status enum ของทุก entity, state diagram, return/inspection flow, return eligibility rule |
| [Permissions & RBAC](permissions-and-rbac.md) | Role catalog, actor/permission matrix, permission key catalog, management-area scope, cross-user visibility rule |
| [Business rules & validation](business-rules-and-validation.md) | Validation rule และความหมายเชิงธุรกิจของแต่ละ domain (asset, reservation, return, admin) |
| [Scope & roadmap](scope-and-roadmap.md) | สิ่งที่ยังไม่อยู่ใน MVP และลำดับพัฒนาที่แนะนำ |
| [Acceptance criteria](acceptance-criteria.md) | เกณฑ์ยอมรับเชิงฟังก์ชันแยกตาม domain |

## เอกสารที่เกี่ยวข้อง

- [Backend specification](../backend_spec/README.md) — architecture, algorithms, OpenAPI contract
- [Frontend specification](../frontend_spec/README.md) — screens, UI states, design system
- [Database schema](../backend_spec/database-schema.md) — Prisma-derived schema, enum และ constraint ต้นฉบับ
- [Implementation status](../status/implementation-status.md) — สถานะ implement จริง ณ ปัจจุบัน (ไม่ใช่ spec)

## หลักการอ่านเอกสารชุดนี้

ทุก fact (status enum, permission key, business rule) ถูกกำหนดไว้ **ที่เดียว** ในชุดเอกสารนี้ เอกสารอื่นใน backend_spec/frontend_spec ที่ต้องอ้างถึง fact เหล่านี้จะลิงก์กลับมาที่นี่แทนการเขียนซ้ำ ดู [cross-reference convention](../README.md#cross-reference-convention)

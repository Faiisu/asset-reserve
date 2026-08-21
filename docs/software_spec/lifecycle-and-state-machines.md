# Lifecycle & state machines

[← กลับไปสารบัญ](README.md)

เอกสารนี้เป็นแหล่งเดียว (single source) สำหรับ status enum และ state transition ของทุก entity ในระบบ ห้ามเอกสารอื่นเขียน status list หรือ transition table ซ้ำ — ให้ลิงก์มาที่หัวข้อในหน้านี้แทน

## 1. ภาพรวม 5-step lifecycle

```mermaid
flowchart LR
    S1["1. Drafted & Created"] --> S2["2. Area Approvals"]
    S2 --> S3["3. Equipment Handover"]
    S3 --> S4["4. Pending Return"]
    S4 --> S5["5. Return Approval & Inspection"]
```

| Step | Phase | Primary actor | สรุป |
| :---: | --- | --- | --- |
| 1 | Drafted & Created | Requester | เลือกวันที่และอุปกรณ์ เพิ่มผู้ร่วมกิจกรรม แล้ว submit |
| 2 | Area Approvals | Area Manager | ตรวจรายการที่ขอในแต่ละ management area ปรับจำนวนอนุมัติ **เลือก serial-numbered unit ที่จะจ่ายให้** แล้ว approve/reject ในขั้นตอนเดียว (§3) |
| 3 | Equipment Handover | Warehouse Staff / Requester | รับมอบอุปกรณ์จริงที่คลัง และยืนยัน handover |
| 4 | Pending Return | Requester / Borrower | ใช้งานอุปกรณ์ เมื่อจบกิจกรรมนำมาคืนที่คลังพร้อม return slip |
| 5 | Return Approval & Inspection | Area Manager (Inspector) | ตรวจสภาพอุปกรณ์ที่คืน (Good/Broken/Lost) แล้วอนุมัติ |

## 2. Reservation status {#reservation-status}

Status เก็บเป็น `String` ใน database (ไม่ใช่ Prisma enum) ค่าที่ระบบยอมรับมีเท่านี้ — ห้าม frontend/backend ใช้ค่าอื่นนอกตารางนี้ (เช่น `ACTIVE`, `PENDING`, `RETURN` แบบเดี่ยวๆ ที่เคยมีในเอกสารรุ่นเก่า **ไม่ใช่ค่าที่ระบบรองรับอีกต่อไป**)

| Status | ความหมาย | Transition ถัดไปที่เป็นไปได้ |
| --- | --- | --- |
| `DRAFT` | กำลังร่าง ยังไม่ submit | `PENDING_APPROVAL`, `CANCELLED` |
| `PENDING_APPROVAL` | รอ area manager อนุมัติ | `APPROVED`, `PARTIALLY_APPROVED`, `REJECTED`, `CANCELLED` |
| `PARTIALLY_APPROVED` | บาง item อนุมัติ (พร้อมผูก serial unit แล้ว — ดู §3) บาง item ถูกปฏิเสธ | `DELIVERY_CONFIRMED`, `CANCELLED` |
| `APPROVED` | ทุก item อนุมัติและผูก serial unit แล้ว รอส่งมอบ | `DELIVERY_CONFIRMED`, `CANCELLED` |
| `DELIVERY_CONFIRMED` | ส่งมอบอุปกรณ์ให้ผู้ขอแล้ว | `RETURN_PENDING`, `COMPLETED` |
| `RETURN_PENDING` | ส่ง return slip แล้ว รอตรวจรับ | `RETURN_CONFIRMED`, `COMPLETED` |
| `RETURN_CONFIRMED` | ตรวจรับและบันทึกสภาพแล้ว | `COMPLETED`, `DELIVERY_CONFIRMED` (ถ้าคืนบางส่วน ยังมี item ค้าง) |
| `COMPLETED` | คืนครบทุก item ที่ checkout แล้ว (final) | – |
| `REJECTED` | ทุก item ถูกปฏิเสธ (final) | – |
| `CANCELLED` | ยกเลิกก่อนรับมอบ (final) | – |

```mermaid
flowchart TD
    DRAFT["DRAFT"]
    PENDING["PENDING_APPROVAL"]
    APPROVED["APPROVED"]
    PARTIAL["PARTIALLY_APPROVED"]
    REJECTED["REJECTED"]
    DELIVERY_CONFIRMED["DELIVERY_CONFIRMED"]
    RETURN_PENDING["RETURN_PENDING"]
    RETURN_CONFIRMED["RETURN_CONFIRMED"]
    COMPLETED["COMPLETED"]
    CANCELLED["CANCELLED"]

    DRAFT -->|User submits| PENDING
    DRAFT -->|User cancels| CANCELLED
    PENDING -->|ทุก item approved| APPROVED
    PENDING -->|บางส่วน approved/rejected| PARTIAL
    PENDING -->|ทุก item rejected| REJECTED
    PENDING -->|User/Manager cancels| CANCELLED
    APPROVED -->|Cancel ก่อน handover| CANCELLED
    PARTIAL -->|Cancel ก่อน handover| CANCELLED
    APPROVED -->|ยืนยัน handover| DELIVERY_CONFIRMED
    PARTIAL -->|ยืนยัน handover ของ item ที่ approve| DELIVERY_CONFIRMED
    DELIVERY_CONFIRMED -->|ส่ง return slip| RETURN_PENDING
    RETURN_PENDING -->|ตรวจสอบและอนุมัติ Good/Broken/Lost| RETURN_CONFIRMED
    RETURN_CONFIRMED -->|คืนครบทุก item| COMPLETED
    RETURN_CONFIRMED -->|คืนบางส่วน ยังมี item ค้าง| DELIVERY_CONFIRMED
```

### Return eligibility rule

Asset สามารถถูกคืนได้ **ตลอดเวลาหลังจาก `endAt` ของ reservation ผ่านไปแล้ว** ไม่ว่า reservation จะอยู่ status ใดก็ตาม (ยกเว้น final status) — เดิมมีการใช้ status `ACTIVE` เพื่อสื่อความหมายนี้ แต่ถูกตัดออกแล้ว เงื่อนไขคือ `now() >= reservation.endAt` ร่วมกับเงื่อนไข status ตามปกติ

## 3. ReservationItem status {#reservation-item-status}

> **Breaking change จากรุ่นก่อนหน้า**: เดิม `PENDING` อนุมัติเป็น `APPROVED` ก่อน แล้วค่อยผูก serial unit เป็นอีกขั้นตอนแยก (`PREPARED`, คนละ endpoint/actor ได้) ตอนนี้ **รวมเป็นการตัดสินใจเดียว** — Area Manager ที่อนุมัติต้องเลือก serial-numbered unit (`assetUnitIds[]`) มาพร้อมกันในคำขอเดียว item จึงข้ามจาก `PENDING` ไป `PREPARED` ตรงๆ ไม่มีสถานะ `APPROVED` เป็นจุดพักอีกต่อไป **Approve เป็น unit-based**: เลือก S/N น้อยกว่าจำนวนที่ขอได้ (`quantity` จะถูกตัดลงให้ตรงกับจำนวนที่ approve จริงทันที ไม่มีส่วนที่เหลือค้าง `PENDING` รออนุมัติรอบถัดไป) — ส่วน **reject ยังเป็น all-or-nothing ทั้ง item เหมือนเดิม** ไม่มี unit-level reject รายละเอียด transaction: [backend_spec/algorithms-and-validation.md §7.5](../backend_spec/algorithms-and-validation.md#75-post-reservationsreservationiditemsitemiddecision)

```mermaid
stateDiagram-v2
    [*] --> PENDING: สร้างพร้อม Reservation
    PENDING --> PREPARED: Area Manager อนุมัติ เลือก S/N 1 ถึง quantity ที่ขอ (§7.5)
    PENDING --> REJECTED: Area Manager ปฏิเสธทั้ง item
    PREPARED --> DELIVERED: ยืนยัน handover แล้ว
    DELIVERED --> RETURNED: ตรวจรับคืนและอนุมัติแล้ว
    RETURNED --> [*]
    REJECTED --> [*]
```

| Status | ความหมาย |
| --- | --- |
| `PENDING` | รอ area manager ตัดสินใจ |
| `REJECTED` | ถูกปฏิเสธทั้ง item (reject ไม่ใช่ unit-based) |
| `PREPARED` | อนุมัติแล้ว และผูก `AssetUnit`/`ReservationItemUnit` (serial) แล้วในคำขอเดียวกัน รอส่งมอบ — `quantity` คือจำนวนที่ approve จริง (อาจน้อยกว่าที่ขอตอน submit ถ้า approve บางส่วน) |
| `CHECKED_OUT` | เป็น status ของ `AssetUnit`/`ReservationItemUnit` (หน่วยจริงที่ถูกส่งมอบ) **ไม่ใช่** status ของ `ReservationItem` เอง — item ข้ามจาก `PREPARED` ไป `DELIVERED` ตรงๆ ตอน delivery-confirm |
| `DELIVERED` | ส่งมอบให้ผู้ขอแล้ว |
| `RETURNED` | คืนครบสำหรับ item นี้แล้ว |

## 3a. ReservationItemUnit status {#reservation-item-unit-status}

สถานะต่อ serial-numbered unit ที่ถูกผูกไว้กับ `ReservationItem` หนึ่งรายการ (ผูกตอน `ReservationItem` เข้าสถานะ `PREPARED` — ดู §3)

```mermaid
stateDiagram-v2
    [*] --> ASSIGNED: ผูก AssetUnit (serial) เข้ากับ ReservationItem
    ASSIGNED --> CHECKED_OUT: ยืนยัน handover
    CHECKED_OUT --> RETURNED_GOOD: ตรวจรับคืน สภาพดี
    CHECKED_OUT --> RETURNED_BROKEN: ตรวจรับคืน ชำรุด
    CHECKED_OUT --> RETURNED_LOST: ตรวจรับคืน สูญหาย
    RETURNED_GOOD --> [*]
    RETURNED_BROKEN --> [*]
    RETURNED_LOST --> [*]
```

| Status | ความหมาย |
| --- | --- |
| `ASSIGNED` | ผูกกับ `AssetUnit` (serial) แล้ว ยังไม่ส่งมอบ |
| `CHECKED_OUT` | ส่งมอบให้ผู้ขอแล้ว (`ReservationItem` ข้ามไป `DELIVERED` พร้อมกัน — §3) |
| `RETURNED_GOOD` | คืนแล้ว ตรวจสภาพดี → `AssetUnit.status` เป็น `ACTIVE` (§7) |
| `RETURNED_BROKEN` | คืนแล้ว ชำรุด → `AssetUnit.status` เป็น `BROKEN` (§7) |
| `RETURNED_LOST` | คืนแล้ว สูญหาย → `AssetUnit.status` เป็น `LOST` (§7) |

Constraint: หน่วยเดียวกัน (`asset_unit_id`) มีได้สูงสุด 1 assignment ที่ยัง active (`ASSIGNED`/`CHECKED_OUT`) ในเวลาเดียวกัน — กันไม่ให้ serial เดียวกันถูกจ่ายให้สองการจองพร้อมกัน

## 4. Approval / ReturnApproval status {#approval-status}

`ReservationItemApproval` และ `ReturnApproval` ใช้ status ชุดเดียวกัน: `PENDING`, `APPROVED`, `REJECTED`

## 5. Return status {#return-status}

| Status | ความหมาย |
| --- | --- |
| `PENDING` | รอตรวจรับ |
| `APPROVED` | ตรวจรับผ่าน |
| `REJECTED` | ปฏิเสธหรือให้แก้ไข |
| `COMPLETED` | backend ประมวลผล item/ledger และปิดการคืนแล้ว |

เมื่อคืนครบสำหรับ item หนึ่ง ให้ `ReservationItem` เป็น `RETURNED` (§3) และเมื่อทุก item ที่ checkout คืนครบ ให้ `Reservation` เป็น `COMPLETED` (§2)

## 6. Return & inspection flow

Return workflow แยก **การส่งคืนโดยผู้ยืม (drop-off)** ออกจาก **การตรวจรับโดยผู้ดูแล (inspection)** อย่างชัดเจน:

```mermaid
sequenceDiagram
    autonumber
    actor Borrower as Borrower (Requester)
    actor Manager as Area Manager (Inspector)
    participant System as Backend / Inventory Service

    Note over Borrower,System: Step 4: Pending Return (Drop-off)
    Borrower->>Borrower: นำอุปกรณ์มาคืนที่คลัง
    Borrower->>System: ส่ง Return slip (ระบุ reservationItemUnitId ที่จะคืน)
    Note over System: สร้าง Return (status: PENDING)<br/>Reservation -> RETURN_PENDING

    Note over Manager,System: Step 5: Return Approval & Inspection
    Manager->>Manager: ตรวจสภาพอุปกรณ์จริงที่คลัง
    Manager->>System: ส่งผลตรวจสอบต่อหน่วย (condition ต่อ serial) พร้อม decision
    Note over System: อัปเดต AssetUnit status ต่อ serial (§7)<br/>Reservation -> COMPLETED (คืนครบ) หรือ -> DELIVERY_CONFIRMED (คืนบางส่วน)<br/>ไม่ persist RETURN_CONFIRMED เป็นสถานะพัก
```

Condition ถูกบันทึก**ต่อ serial-numbered unit** (`ReturnItemUnit.condition`) ไม่ใช่ตัวเลข quantity รวม

## 7. Condition classification → AssetUnit status {#condition-classification}

| Condition | `AssetUnit.status` หลังตัดสินใจ | สี (badge) | ผล |
| --- | --- | :---: | --- |
| Good | `ACTIVE` | เขียว | กลับเข้า shared pool พร้อมให้จองใหม่ |
| Broken | `BROKEN` | เหลือง | ถูกตัดออกจาก availability รอซ่อม |
| Lost | `LOST` | แดง | ถูกตัดออกจาก availability ถาวร ไม่มี stock counter แยกให้ลด |

`AssetUnit.status` มีค่าที่เป็นไปได้เพิ่มเติมนอกช่วง reservation/return: `RESERVED`, `IN_REPAIR`, `INACTIVE` — วงจรเต็มคือ `ACTIVE ↔ RESERVED ↔ CHECKED_OUT ↔ BROKEN/LOST ↔ IN_REPAIR ↔ INACTIVE` รายละเอียด validation ของแต่ละ transition อยู่ใน [backend_spec/algorithms-and-validation.md](../backend_spec/algorithms-and-validation.md)

## เอกสารที่เกี่ยวข้อง

- Business rule และ validation อื่น (เช่น conflict detection, past-date protection): [business-rules-and-validation.md](business-rules-and-validation.md)
- Permission ที่ต้องมีในแต่ละ transition: [permissions-and-rbac.md](permissions-and-rbac.md)
- Algorithm การคำนวณ availability/conflict และ implementation ของ transition เหล่านี้: [backend_spec/algorithms-and-validation.md](../backend_spec/algorithms-and-validation.md)
- การแสดง status เป็นสีใน UI: [frontend_spec/status-color-mapping.md](../frontend_spec/status-color-mapping.md)

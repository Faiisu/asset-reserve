# Asset Reservation System: Lifecycle, Actors, States & Flow Specification

This document provides the technical specification and workflow guide for the Asset Reservation & Return system. It details the **5-step lifecycle**, **actors & permissions**, **state machines**, **UI manifest interactions**, and **underlying algorithms** for conflict detection, asset locking, delivery confirmation (handover), and return inspection (Good, Broken, Lost).

---

## 1. 5-Step Lifecycle Overview

The complete reservation lifecycle consists of 5 sequential phases:

```mermaid
flowchart LR
    S1["1. Drafted & Created"] --> S2["2. Area Approvals"]
    S2 --> S3["3. Equipment Handover"]
    S3 --> S4["4. Pending Return"]
    S4 --> S5["5. Return Approval & Inspection"]
```

| Step | Phase Name | Primary Actor | Action Summary | Status Badge & Theme |
| :---: | :--- | :--- | :--- | :--- |
| **1** | **Drafted & Created** | Requester / User | Select dates & equipment items, add co-participants, submit draft. | `DRAFT` / `PENDING_APPROVAL` (Yellow/Slate) |
| **2** | **Area Approvals** | Area Manager(s) | Review requested items in Reserved Equipment Manifest, adjust approval quantities, approve or reject. | `PENDING_APPROVAL` → `APPROVED` (Blue) |
| **3** | **Equipment Handover** | Warehouse Staff / Requester | Physical pickup at warehouse. Confirm handover of approved items. | `APPROVED` (Blue) → `DELIVERY_CONFIRMED` (Green) |
| **4** | **Pending Return** | Requester / Borrower | Equipment in use. At event conclusion, borrower returns equipment to warehouse and submits return slip with quantities and drop-off notes. | `DELIVERY_CONFIRMED` / `RETURN_PENDING` (Amber/Orange) |
| **5** | **Return Approval & Inspection** | Area Manager (Inspector) | Physically inspect returned items in warehouse. Record condition breakdown (**Good**, **Broken**, **Lost**), add remarks, and approve restock. | `RETURN_PENDING` → `COMPLETED` / `RETURN_CONFIRMED` (Green) |

---

## 2. Actors, Roles & Permission Matrix

| Actor / Role | Scoped Permissions | Who Requests? | Who Actions? | Permitted Actions |
| :--- | :--- | :---: | :---: | :--- |
| **Requester** *(Borrower / User)* | `reservation:create`<br>`reservation:update` | **Yes** | **Yes** | • Create draft / submit reservation.<br>• Submit change requests (dates, items, participants).<br>• Confirm equipment handover (`DELIVERED`).<br>• **Submit return slip with item quantity**.<br>• Cancel reservation before pickup. |
| **Co-Participant** *(User)* | Linked in `ReservationParticipant` | No | **Yes** | • View reservation details.<br>• Submit return slip on behalf of requester. |
| **Area Manager** *(Asset Custodian)* | `reservation:approve`<br>`reservation:reject`<br>`return:approve`<br>*(Scoped by Management Area)* | No | **Yes** | • Review & approve/reject items belonging to their area.<br>• Adjust approved item quantities.<br>• Review & approve/reject change requests.<br>• **Physically inspect equipment and record Good, Broken, and Lost quantities** in manifest checklist.<br>• Approve/reject return slips (triggers automated inventory updates). |
| **Admin** | Global system access | **Yes** | **Yes** | • Global override across all management areas.<br>• Force cancellation, approval, or inventory correction. |

---

## 3. State Machines

### 3.1 Reservation Lifecycle State Diagram

```mermaid
flowchart TD
    DRAFT["DRAFT\n(Drafted by User)"]
    PENDING["PENDING_APPROVAL\n(Under Review by Area Managers)"]
    APPROVED["APPROVED\n(All items approved • Waiting for Handover)"]
    PARTIAL["PARTIALLY_APPROVED\n(Some approved, some rejected)"]
    REJECTED["REJECTED\n(All items rejected)"]
    DELIVERY_CONFIRMED["DELIVERY_CONFIRMED\n(All items handed over to borrower)"]
    RETURN_PENDING["RETURN_PENDING\n(Return slip submitted by borrower • Awaiting Inspection)"]
    RETURN_CONFIRMED["RETURN_CONFIRMED\n(Inspected and accepted • Good/Broken/Lost recorded)"]
    COMPLETED["COMPLETED\n(All items fully returned & restocked)"]
    CANCELLED["CANCELLED\n(Cancelled before handover)"]

    DRAFT -->|User Submits| PENDING
    DRAFT -->|User Cancels| CANCELLED

    PENDING -->|All items approved| APPROVED
    PENDING -->|Mixed approvals & rejections| PARTIAL
    PENDING -->|All items rejected| REJECTED
    PENDING -->|User / Manager Cancels| CANCELLED

    APPROVED -->|User cancels before handover| CANCELLED
    PARTIAL -->|User cancels before handover| CANCELLED

    APPROVED -->|Warehouse confirms handover| DELIVERY_CONFIRMED
    PARTIAL -->|Warehouse confirms handover of approved items| DELIVERY_CONFIRMED

    DELIVERY_CONFIRMED -->|Borrower submits return slip| RETURN_PENDING
    RETURN_PENDING -->|Area Manager inspects & approves Good/Broken/Lost| RETURN_CONFIRMED
    RETURN_CONFIRMED -->|All items returned| COMPLETED
    RETURN_CONFIRMED -->|Partial return, remaining items still out| DELIVERY_CONFIRMED
```

### 3.2 Line-Item Lifecycle

```mermaid
stateDiagram-v2
    [*] --> PENDING: Created in Reservation
    PENDING --> APPROVED: Area Manager Approves
    PENDING --> REJECTED: Area Manager Rejects
    APPROVED --> PREPARED: Serial-numbered units assigned (ACTIVE -> RESERVED)
    PREPARED --> DELIVERED: Handover Confirmed (units RESERVED -> CHECKED_OUT)
    DELIVERED --> RETURNED: Area Manager Inspects & Approves Return
    RETURNED --> [*]
    REJECTED --> [*]
```

`CHECKED_OUT` เป็น status ของ `AssetUnit`/`ReservationItemUnit` (หน่วยจริงที่ถูกส่งมอบ) ไม่ใช่ status ของ `ReservationItem` เอง — item ข้ามจาก `PREPARED` ไป `DELIVERED` ตรงๆ ตอน delivery-confirm

---

## 4. Unified Manifest Interaction Model

All operational lifecycle actions are consolidated into the **Reserved Equipment Manifest** for consistency:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ Reserved Equipment Manifest (Uniform Manifest Interaction)                            │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 1. Area Approval Mode:                                                                 │
│    • Top Bar: [Remark input] [Approve Selected] [Reject Selected]                      │
│    • Row: [✓] [Image] [Name + Area] [Approve Qty / Total] [Pending Badge]              │
│                                                                                        │
│ 2. Handover Mode:                                                                      │
│    • Top Bar: [Confirm Handover (X items)]                                             │
│    • Row: [✓] [Image] [Name + Area] [Qty units] [Approved Badge]                       │
│                                                                                        │
│ 3. Pending Return Mode (Borrower Submission):                                          │
│    • Top Bar: [Submit Return (X items)]                                                │
│    • Row: [✓] [Image] [Name + Area] [Return Qty / Remaining] [Pending Return Badge]   │
│                                                                                        │
│ 4. Return Approval & Inspection Mode (Area Manager Inspection):                        │
│    • Top Bar: [Inspection remarks] [Approve Return] [Reject Return]                    │
│    • Grid Header: [✓] [Image] [Equipment & Area] [Good] [Broken] [Lost]                │
│    • Row: [✓] [Image] [Name + Area] [Good input] [Broken input] [Lost input]           │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Return & Inspection Flow (Step 4 vs. Step 5)

The return workflow strictly separates **Borrower Submission** from **Custodian Inspection**:

```mermaid
sequenceDiagram
    autonumber
    actor Borrower as Borrower (Requester)
    actor Manager as Area Manager (Inspector)
    participant System as Backend / Inventory Service

    Note over Borrower,System: Step 4: Pending Return (Drop-off & Return Submission)
    Borrower->>Borrower: 1. Brings physical equipment to warehouse drop-off
    Borrower->>System: 2. Submit Return Slip (POST /api/v1/reservations/:id/returns)<br/>Payload: { items: [{ reservationItemId, reservationItemUnitIds: [unitA, unitB] }], note: "Left at Desk A" }
    Note over System: Return record created (status: PENDING)<br/>Reservation status -> RETURN_PENDING

    Note over Manager,System: Step 5: Return Approval & Physical Inspection
    Manager->>Manager: 3. Conducts physical inspection in warehouse<br/>Checks operational status, parts, and wear & tear
    Manager->>System: 4. Submit Condition Breakdown & Decision (POST /api/v1/returns/:returnId/decision)<br/>Payload: { decision: "APPROVE", items: [{ reservationItemId, units: [{ reservationItemUnitId: unitA, condition: "GOOD" }, { reservationItemUnitId: unitB, condition: "BROKEN" }] }], description: "Cable damaged" }

    Note over System: 5. Execute Automated Asset Unit Status Updates (per serial)<br/>• GOOD: unit -> ACTIVE, back in the shared pool<br/>• BROKEN: unit -> BROKEN, logged for repair<br/>• LOST: unit -> LOST<br/>Reservation status -> RETURN_CONFIRMED (-> COMPLETED once every item is returned)
```

### Condition Classification Matrix

Condition is recorded per serial-numbered unit (`ReturnItemUnit.condition`), not as an aggregate quantity:

| Condition | `AssetUnit.status` After Decision | Color Indicator | Effect |
| :--- | :--- | :---: | :--- |
| **Good** | `ACTIVE` | 🟢 Green | Unit returns to the shared pool, available for new bookings. |
| **Broken** | `BROKEN` | 🟡 Amber | Unit flagged for repair/maintenance, excluded from availability. |
| **Lost** | `LOST` | 🔴 Red | Unit excluded from availability; no separate stock counter to decrement. |

---

## 6. Algorithms & Business Logic

### 6.1 Conflict Detection & Overlap Calculation

When a reservation is submitted, updated, or approved, the system evaluates time overlap against existing approved bookings:

$$\text{Existing.start\_at} < \text{Requested.end\_at} \quad\land\quad \text{Existing.end\_at} > \text{Requested.start\_at}$$

```ts
// "Total" is not a stored column -- it's derived per-asset by counting
// AssetUnit rows that aren't retired.
const totalQuantity = await db.assetUnit.count({
  where: { assetId, status: { not: "INACTIVE" } },
});

// Sum overlapping approved reservations
const approvedQuantity = overlappingItems
  .filter(item => 
    ['APPROVED', 'PREPARED', 'CHECKED_OUT', 'DELIVERED'].includes(item.status) &&
    ['PARTIALLY_APPROVED', 'APPROVED', 'DELIVERY_CONFIRMED', 'RETURN_PENDING', 'RETURN_CONFIRMED', 'COMPLETED'].includes(item.reservation.status)
  )
  .reduce((sum, item) => sum + item.quantity, 0);

// Available headroom
const availableQuantity = Math.max(0, totalQuantity - approvedQuantity);

if (requestedQuantity > availableQuantity) {
  throw new ApiException(409, "RESERVATION_CONFLICT", `Only ${availableQuantity} units available.`);
}
```

---

## 7. API Endpoint Reference

| Step | Endpoint | Method | Required Permission | Payload Summary | Result State |
| :---: | :--- | :---: | :--- | :--- | :--- |
| **1** | `/api/v1/reservations` | `POST` | User (`reservation:create`) | `{ eventName, startAt, endAt, items, participantIds }` | `DRAFT` / `PENDING_APPROVAL` |
| **2** | `/api/v1/reservations/:id/items/decision` | `POST` | Area Manager (`reservation:approve`) | `{ itemIds: [...], decision: 'APPROVE' \| 'REJECT', comment? }` | Items: `APPROVED`/`REJECTED`<br>Res: `APPROVED` |
| **3** | `/api/v1/reservations/:id/delivery-confirm` | `POST` | Requester / Staff | `{ itemIds?: [...] }` | Items: `DELIVERED`<br>Res: `DELIVERY_CONFIRMED` |
| **4** | `/api/v1/reservations/:id/returns` | `POST` | Requester / Participant | `{ items: [{ reservationItemId, reservationItemUnitIds: [...] }] }` | Return: `PENDING`<br>Res: `RETURN_PENDING` |
| **5** | `/api/v1/reservations/:id/returns/:returnId/decision` | `POST` | Area Manager (`return:approve`) | `{ decision: 'APPROVE' \| 'REJECT', items: [{ reservationItemId, units: [{ reservationItemUnitId, condition: 'GOOD'\|'BROKEN'\|'LOST' }], description? }], description? }` | Return: `COMPLETED`<br>Res: `RETURN_CONFIRMED`/`COMPLETED` |
| **—** | `/api/v1/reservations/:id/cancel` | `POST` | Requester / Admin | `{ reason? }` | `CANCELLED` |


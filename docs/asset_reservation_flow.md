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
| **Requester** *(Borrower / User)* | `reservation:create`<br>`reservation:update` | **Yes** | **Yes** | • Create draft / submit reservation.<br>• Submit change requests (dates, items, participants).<br>• Confirm equipment handover (`DELIVERED`).<br>• **Submit return slip with item quantity and drop-off notes**.<br>• Cancel reservation before pickup. |
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
    RETURN_PENDING["RETURN_PENDING / RETURN\n(Return slip submitted by borrower • Awaiting Inspection)"]
    COMPLETED["COMPLETED / RETURN_CONFIRMED\n(Inspected by Area Manager • Good/Broken/Lost restocked)"]
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
    RETURN_PENDING -->|Area Manager inspects & approves Good/Broken/Lost| COMPLETED
    RETURN_PENDING -->|Partial return or additional batches| RETURN_PENDING
```

### 3.2 Line-Item Lifecycle

```mermaid
stateDiagram-v2
    [*] --> PENDING: Created in Reservation
    PENDING --> APPROVED: Area Manager Approves
    PENDING --> REJECTED: Area Manager Rejects
    APPROVED --> DELIVERED: Handover Confirmed
    DELIVERED --> RETURNED: Area Manager Inspects & Approves Return
    RETURNED --> [*]
    REJECTED --> [*]
```

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
│    • Top Bar: [Drop-off note input] [Submit Return (X items)]                          │
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
    Borrower->>System: 2. Submit Return Slip (POST /api/v1/reservations/:id/returns)<br/>Payload: { items: [{ reservationItemId, quantityReturned: 2 }], note: "Left at Desk A" }
    Note over System: Return record created (status: PENDING)<br/>Reservation status -> RETURN_PENDING

    Note over Manager,System: Step 5: Return Approval & Physical Inspection
    Manager->>Manager: 3. Conducts physical inspection in warehouse<br/>Checks operational status, parts, and wear & tear
    Manager->>System: 4. Submit Condition Breakdown & Decision (POST /api/v1/returns/:returnId/decision)<br/>Payload: { decision: "APPROVE", items: [{ quantityReturned (Good): 1, quantityBroken: 1, quantityLost: 0 }], description: "Cable damaged" }

    Note over System: 5. Execute Automated Inventory Adjustments<br/>• Good (1): Returned to active stock pool for new bookings<br/>• Broken (1): Queued for repair log / maintenance<br/>• Lost (0): Stock total decremented if missing<br/>Reservation status -> COMPLETED / RETURN_CONFIRMED
```

### Condition Classification Matrix

| Condition | Form Field | Color Indicator | Warehouse Inventory Effect |
| :--- | :--- | :---: | :--- |
| **Good** | `quantityReturned` | 🟢 Green | Restocked into available inventory pool for new bookings. |
| **Broken** | `quantityBroken` | 🟡 Amber | Logged into repair/maintenance queue; master stock total maintained. |
| **Lost** | `quantityLost` | 🔴 Red | Decremented from total warehouse catalog stock (`totalQuantity -= lost`). |

---

## 6. Algorithms & Business Logic

### 6.1 Conflict Detection & Overlap Calculation

When a reservation is submitted, updated, or approved, the system evaluates time overlap against existing approved bookings:

$$\text{Existing.start\_at} < \text{Requested.end\_at} \quad\land\quad \text{Existing.end\_at} > \text{Requested.start\_at}$$

```ts
// Sum overlapping approved reservations
const approvedQuantity = overlappingItems
  .filter(item => 
    ['APPROVED', 'PREPARED', 'CHECKED_OUT', 'DELIVERED'].includes(item.status) &&
    ['APPROVED', 'PARTIALLY_APPROVED', 'DELIVERY_CONFIRMED', 'ACTIVE', 'RETURN_PENDING'].includes(item.reservation.status)
  )
  .reduce((sum, item) => sum + item.quantity, 0);

// Available headroom
const availableQuantity = Math.max(0, asset.totalQuantity - approvedQuantity);

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
| **4** | `/api/v1/reservations/:id/returns` | `POST` | Requester / Participant | `{ items: [{ reservationItemId, quantityReturned }], note? }` | Return: `PENDING`<br>Res: `RETURN_PENDING` |
| **5** | `/api/v1/returns/:returnId/decision` | `POST` | Area Manager (`return:approve`) | `{ decision: 'APPROVE' \| 'REJECT', items: [{ reservationItemId, quantityReturned, quantityBroken, quantityLost, description? }], description? }` | Return: `COMPLETED`<br>Res: `COMPLETED` |
| **—** | `/api/v1/reservations/:id/cancel` | `POST` | Requester / Admin | `{ reason? }` | `CANCELLED` |

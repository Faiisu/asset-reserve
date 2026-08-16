# Reservations

[← กลับไปสารบัญ](../README.md) · [📖 เอกสารสถาปัตยกรรมและการออกแบบ UI ฉบับสมบูรณ์ (Master Blueprint)](../reservation_flow_and_ui_design.md)

---

## 📌 Master Blueprint Reference
สำหรับพิมพ์เขียวฉบับสมบูรณ์ที่รวม **Flowchart Mermaid**, **State Transitions**, **REST API Contracts**, **UI Component Hierarchy** และ **แนวทางการออกแบบ UI/UX หน้า Reservations ใหม่** สามารถดูได้ที่ไฟล์:
👉 [`docs/frontend_spec/reservation_flow_and_ui_design.md`](../reservation_flow_and_ui_design.md)

---

## 1. Create Reservation (/reservations/new)

หน้าฟอร์มสร้างการจองแบ่งออกเป็น 3 ส่วนหลัก:

### Event Details
- `eventName`: Required (สูงสุด 200 ตัวอักษร)
- `description`: Optional
- `startAt` / `endAt`: Required (เงื่อนไข: `endAt > startAt`)
- `requesterId`: มาจาก Authenticated User Session

### Reservation Items (รายการอุปกรณ์)
- `assetId`: UUID ของอุปกรณ์
- `quantity`: จำนวนเต็ม $> 0$
- ตรวจสอบ `availableQuantity` แบบ Real-time ตามช่วงเวลาที่เลือก
- แสดง Overlap Warning หากมีความต้องการซ้อนทับ
- รองรับการบันทึกแบบ **Draft** (`DRAFT`) หรือ **Submit for Approval** (`PENDING_APPROVAL`)

### Participants (ผู้ร่วมกิจกรรม)
- เลือก User ในระบบมาร่วมใช้งานใน Event
- ห้ามเลือก User ซ้ำ

---

## 2. Complete Status Lifecycle & Transitions

```text
[DRAFT] ───> [PENDING_APPROVAL] ───> [APPROVED / PARTIALLY_APPROVED] ───> [DELIVERY_CONFIRMED] ───> [ACTIVE] ───> [RETURN_PENDING] ───> [COMPLETED]
   │                 │                              │
   └──> [CANCELLED]  └──> [REJECTED / CANCELLED]    └──> [CANCELLED]
```

### Reservation Item Status
```text
PENDING ───> APPROVED ───> DELIVERED ───> RETURNED
         ───> REJECTED
```

---

## 3. Granular Actions & Dialogs

1. **Confirm Delivery (`POST /delivery-confirm`):** ผู้ใช้หรือผู้ดูแลยืนยันการรับมอบอุปกรณ์จริง
2. **Change Request (`POST /change-requests`):** ส่งคำขอขยายเวลาหรือปรับรายการอุปกรณ์ระหว่างรอใช้งาน
3. **Return Request (`POST /returns`):** ผู้ใช้แจ้งจำนวนอุปกรณ์ที่นำมาส่งคืน
4. **Return Inspection Decision (`POST /returns/:id/decision`):** ผู้จัดการพื้นที่ตรวจนับและแยกสภาพอุปกรณ์ (Good / Broken / Lost) พร้อมอัปเดตยอดคงเหลือในคลังอัตโนมัติ

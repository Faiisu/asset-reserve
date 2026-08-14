# API and authentication

[← Backend specification](../README.md)

ข้อกำหนด endpoint, input/output และ authorization matrix สำหรับงาน Authentication และ Permission Management อยู่ที่ [Authentication and permission API contract](authentication-and-permission-api.md) พร้อม [OpenAPI สำหรับสร้าง mock/client](../contracts/auth-permission.openapi.yaml)

## API requirements

- Base path: `/api/v1`
- Content type: `application/json`
- Contract: OpenAPI generated จาก backend
- Date/time: ISO 8601 พร้อม timezone
- ID: UUID string
- List endpoint ต้องมี pagination และ page-size limit
- Mutation สำคัญต้องรองรับ idempotency key
- API response ห้ามเปิดเผย `passwordHash` หรือ `providerUserId` โดยไม่จำเป็น
- Backend ต้องตอบ `401`, `403`, `404`, `409` และ `422` อย่างมีความหมาย

Error shape:

```json
{
  "error": {
    "code": "INSUFFICIENT_QUANTITY",
    "message": "One or more assets do not have enough available quantity.",
    "fields": {
      "items.0.quantity": "Only 2 units are available."
    },
    "requestId": "e9d1..."
  }
}
```

### Idempotency

Operations ต่อไปนี้ต้องรับ `Idempotency-Key`:

- Submit reservation
- Approve/reject reservation items
- Inventory adjustment
- Prepare/check out
- Create return
- Approve/reject return

Backend ต้องคืนผลเดิมเมื่อ key และ actor เดิมส่ง payload เดิมซ้ำ และต้องตอบ conflict เมื่อใช้ key เดิมกับ payload ต่างกัน การทำ persistent idempotency ต้องเพิ่ม model/migration ก่อน implement

## Authentication และ authorization

- Password ต้อง hash ด้วย Argon2id
- Access token ต้องเป็น signed token อายุสั้น ค่าเริ่มต้นแนะนำ 10–15 นาที
- Token อาจมี user ID, role, permission และ management-area scopes เพื่อลด session lookup
- Critical mutation ต้องตรวจ `User.isActive`, permission และ scope จากฐานข้อมูลซ้ำ
- การ deactivate user อาจมีผลช้าที่สุดเท่าอายุ access token หากยังไม่มี server-side session/revocation model
- External authentication ต้อง map ผ่าน `UserAuthIdentity`
- Nginx/backend ต้องใช้ HTTPS ใน production on-premise
- CORS อนุญาตเฉพาะ configured frontend origin
- หาก authentication ใช้ cookie ต้องมี CSRF protection

Frontend visibility เป็นเพียง UX Backend guard ต้องเป็นผู้ตัดสินสิทธิ์จริงทุก request

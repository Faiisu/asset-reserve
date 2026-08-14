# API contract

[← กลับไปสารบัญ](../README.md)

Authentication, session, user และ role management ต้องอ้างอิง [Auth and permission API contract](../../backend_spec/detail/authentication-and-permission-api.md) และ [OpenAPI](../../backend_spec/contracts/auth-permission.openapi.yaml) เพื่อให้ frontend ใช้ mock contract เดียวกับ backend

## API behavior ที่ frontend ต้องพึ่งพา

| Operation                   | Input สำคัญ                            | Output/ข้อกำหนด                                 |
| --------------------------- | -------------------------------------- | ----------------------------------------------- |
| Login/session               | email/password หรือ provider           | SessionUser และ secure session                  |
| List assets                 | search, area, template, active, cursor | AssetSummary พร้อม availableQuantity            |
| Asset availability          | assetIds, startAt, endAt               | availableQuantity และ conflict reason           |
| Create/update asset         | Prisma-aligned fields                  | Validation และ updated Asset                    |
| Inventory adjustment        | description, transaction lines         | Batch, transactions และยอดใหม่แบบ atomic        |
| Create reservation          | event fields, participants, items      | Reservation เดียวพร้อมหลาย items                |
| Submit reservation          | reservationId                          | PENDING_APPROVAL หรือ structured error          |
| Decide items                | itemIds, decision, comment             | Item approvals และ aggregate Reservation status |
| Prepare/check out           | itemIds                                | updated items พร้อม actor/timestamp             |
| Create change request       | reservationId, reason, changeData      | Pending change request                          |
| Create return               | reservationId, return items            | Return status PENDING                           |
| Decide return               | returnId, decision, description        | ReturnApproval และ updated lifecycle            |
| Users/roles/areas/templates | scoped payload                         | Guarded CRUD ตาม permission                     |

Error shape แนะนำ:

```json
{
  "error": {
    "code": "INSUFFICIENT_QUANTITY",
    "message": "One or more assets do not have enough available quantity.",
    "fields": {
      "items.0.quantity": "Only 2 units are available for this period."
    }
  }
}
```

Frontend ต้องรองรับ 400, 401, 403, 404, 409 และ 422 โดยคงค่าฟอร์มเมื่อ validation ล้มเหลว

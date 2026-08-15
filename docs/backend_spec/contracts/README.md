# OpenAPI contract structure

[← Backend specification](../README.md) · [API algorithm reference](../detail/api-algorithms.md)

OpenAPI source ถูกแยกตาม domain เพื่อให้อ่านและแก้ไขได้ง่าย ส่วน Swagger runtime ใช้ไฟล์ bundle ที่สร้างอัตโนมัติจาก source ทั้งหมด

## Files

```text
contracts/
├── openapi.yaml                 # Root document และสารบัญ $ref
├── paths/                       # Endpoint definitions แยกตาม domain
├── components/
│   ├── schemas/                 # DTO schemas แยกตาม domain
│   ├── headers.yaml
│   ├── parameters.yaml
│   ├── responses.yaml
│   └── security-schemes.yaml
└── dist/
    └── openapi.bundle.yaml      # Generated runtime artifact (ไม่ commit)
```

แก้ contract ที่ `openapi.yaml`, `paths/` หรือ `components/` เท่านั้น ห้ามแก้ `dist/openapi.bundle.yaml` โดยตรง เพราะคำสั่ง bundle จะเขียนทับไฟล์นี้

## Generate the Swagger bundle

```bash
cd backend
npm run openapi:bundle
```

คำสั่ง `npm run build` และ `npm run dev` จะ bundle ให้อัตโนมัติก่อนทำงาน ส่วน Docker image จะ generate bundle ภายใน build stage และ copy เฉพาะ runtime artifact เข้า image

หลัง generate แล้ว backend จะโหลด `docs/backend_spec/contracts/dist/openapi.bundle.yaml` เป็นค่าเริ่มต้น หรือโหลด path ที่กำหนดผ่าน `OPENAPI_CONTRACT_PATH`

## Domain mapping

| Domain          | Paths                        | Schemas                                   |
| --------------- | ---------------------------- | ----------------------------------------- |
| Authentication  | `paths/authentication.yaml`  | `components/schemas/authentication.yaml`  |
| Session BFF     | `paths/session.yaml`         | ใช้ authentication schemas                |
| Access control  | `paths/access-control.yaml`  | `components/schemas/access-control.yaml`  |
| Users           | `paths/users.yaml`           | `components/schemas/users.yaml`           |
| Assets          | `paths/assets.yaml`          | `components/schemas/assets.yaml`          |
| Inventory       | `paths/inventory.yaml`       | `components/schemas/inventory.yaml`       |
| Asset templates | `paths/asset-templates.yaml` | `components/schemas/asset-templates.yaml` |
| Shared models   | —                            | `components/schemas/common.yaml`          |

เมื่อเพิ่ม API ใหม่ ให้เพิ่ม Path Item ในไฟล์ domain, register `$ref` ใน `openapi.yaml`, เพิ่ม schema/component ที่เกี่ยวข้อง และรัน bundle เพื่อตรวจว่า reference ทุกตัว resolve ได้

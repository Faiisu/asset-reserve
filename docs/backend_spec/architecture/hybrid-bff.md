# Hybrid BFF architecture

[← Backend specification](../README.md)

## Layer model

```text
Presentation
├── BFF Controllers
└── Domain Controllers
        ↓
Application
├── Commands
├── Queries
└── Transaction orchestration
        ↓
Domain
├── Policies
├── State transitions
└── Validation rules
        ↓
Infrastructure
├── Prisma repositories
├── Authentication adapters
└── Logging/observability
```

### BFF Controllers

- ให้ response shape ตาม page/view
- รวมข้อมูลหลาย domain ผ่าน application query services
- คืน capabilities และ computed fields ที่ UI ต้องใช้
- ลด round trips และ payload ที่ไม่จำเป็น
- ไม่เขียนฐานข้อมูลและไม่มี business rule

### Domain Controllers

- รับ command/mutation ที่ใช้ซ้ำได้และไม่ผูกกับ layout
- ตรวจ DTO และส่งต่อ application command
- คืน resource/result หรือ structured error
- ไม่เรียก repository โดยข้าม application layer

### Application services

- เป็น entrypoint ของ use case
- บังคับ authorization และ scope
- จัด transaction boundary
- เรียก domain policy และ repositories
- ถูก reuse โดยทั้ง BFF และ Domain Controllers

### Infrastructure

- Prisma implementation
- PostgreSQL transactions
- Token/password adapters
- Logs, health checks และ external integration

## API surfaces

| Prefix      | Purpose                                         |
| ----------- | ----------------------------------------------- |
| /api/v1/bff | Page-oriented read endpoints                    |
| /api/v1     | Domain commands และ resource operations         |
| /api/docs   | OpenAPI/Swagger สำหรับ development/internal use |

BFF และ Domain API ต้องอยู่ใน NestJS application เดียวใน concept phase ห้าม deploy BFF เป็น service แยกจนกว่าจะมีเหตุผลจาก scaling หรือ team ownership

## Dependency direction

```mermaid
flowchart LR
    BF[BFF Controllers] --> AP[Application]
    DC[Domain Controllers] --> AP
    AP --> DO[Domain]
    AP --> IF[Repository interfaces]
    IN[Prisma repositories] --> IF
    IN --> DB[(PostgreSQL)]
```

Dependency ต้องชี้เข้าหา application/domain ห้าม domain import NestJS, Prisma หรือ HTTP DTO

## Repository structure

โครงสร้างเป้าหมาย:

```text
asset-reservation/
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   ├── pages/
│   │   ├── features/
│   │   ├── components/
│   │   └── api-generated/
│   └── package.json
├── backend/
│   ├── src/
│   │   ├── auth/
│   │   ├── users/
│   │   ├── access-control/
│   │   ├── management-areas/
│   │   ├── assets/
│   │   ├── inventory/
│   │   ├── reservations/
│   │   ├── returns/
│   │   ├── database/
│   │   └── common/
│   ├── prisma/
│   │   ├── schema.prisma
│   │   ├── models/
│   │   └── migrations/
│   ├── prisma.config.ts
│   └── package.json
├── docs/
├── docker-compose.yml
└── package.json
```

Frontend และ backend ต้องมี dependency, environment variables, build output และ Docker image แยกจากกัน

## Backend architecture

Backend ใช้ modular monolith โดยแบ่ง module ตาม business domain:

| Module                     | Responsibility                                                     |
| -------------------------- | ------------------------------------------------------------------ |
| AuthModule                 | Password/external authentication, token issuance และ guards        |
| UsersModule                | User, profile และ active state                                     |
| AccessControlModule        | Role, permissions และ ManagementArea scope                         |
| ManagementAreasModule      | Management area lookup/administration                              |
| AssetTemplatesModule       | Asset template CRUD                                                |
| AssetsModule               | Asset CRUD, availability summary และ active state                  |
| InventoryModule            | AssetTransactionBatch, AssetTransaction และ atomic quantity update |
| ReservationsModule         | Reservation, items, participants, availability และ lifecycle       |
| ReservationApprovalsModule | Item-level approval และ aggregate reservation status               |
| ReservationChangesModule   | Change request validation/review                                   |
| ReturnsModule              | Partial return, approval, ledger effects และ completion            |
| DatabaseModule             | PrismaClient singleton และ transaction utilities                   |

Controller ต้องรับ/ตอบ DTO เท่านั้น Business rule อยู่ใน service/domain layer และ Prisma query อยู่ใน repository หรือ domain service ที่กำหนดชัดเจน

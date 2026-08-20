# Asset Reservation — Backend Specification

เอกสารนี้เป็น source of truth สำหรับการ implement backend ของระบบ Hybrid BFF แบบ on-premise เอกสารนี้อธิบายเฉพาะ **วิธีสร้าง** (HOW) — business rule และ requirement (WHAT) อยู่ที่ [software specification](../software_spec/README.md), UI/UX design อยู่ที่ [frontend specification](../frontend_spec/README.md)

เอกสารที่เกี่ยวข้อง:

- [Documentation index](../README.md) — cross-reference convention
- [Software specification](../software_spec/README.md)
- [Frontend specification](../frontend_spec/README.md)
- [Implementation status](../status/implementation-status.md)
- [Prisma schema](../../backend/prisma/schema.prisma)

## Documentation structure

| เอกสาร | เนื้อหา |
| --- | --- |
| [Hybrid BFF architecture](architecture/hybrid-bff.md) | Layers, API surfaces, modules และ repository structure |
| [Algorithms and validation](algorithms-and-validation.md) | Request pipeline, permission-scope calculation, pagination, error table, per-endpoint algorithm |
| [Database and concurrency](database-and-concurrency.md) | Connection pool, transaction, retry, constraints และ indexes |
| [Database schema](database-schema.md) | ตาราง, field, constraint และ relation ต้นฉบับ (canonical schema reference) |
| [Auth and permission API](auth-and-permission-api.md) | Endpoint behavior, validation, error table และ security model สำหรับ authentication/authorization |
| [Recognition module](modules/recognition.md) | Route, request/response และ algorithm ของ recognition endpoints |
| [Email templates module](modules/email-templates.md) | Route, request/response และ algorithm ของ email-template endpoints |
| [Notification settings module](modules/notification-settings.md) | Route, request/response และ algorithm ของ notification-settings endpoints |
| [Google/Microsoft auth and notifications](integrations/google-microsoft-auth-and-notifications.md) | OAuth linking, email notifications และ calendar sync — current-state design |
| [OAuth setup](integrations/oauth-setup.md) | Dev/deploy toggle และวิธีตั้งค่า Google/Microsoft OAuth client จริง |
| [Engineering conventions](engineering-conventions-backend.md) | NestJS layering, Prisma schema/migration conventions, naming |
| [Deployment and operations](deployment-and-operations.md) | Docker Compose topology, environment configuration, observability, backup |
| [Testing strategy](testing-strategy.md) | Test strategy และ non-functional requirements |
| [OpenAPI contract](contracts/README.md) | โครงสร้าง contract แบบ modular และวิธีสร้าง Swagger bundle — **sole source ของ request/response shape** |

## Backend stack

| Layer | Technology |
| --- | --- |
| Runtime/API | Node.js, NestJS, Fastify |
| Contract | REST, OpenAPI |
| ORM | Prisma ORM 7 |
| Driver | pg, @prisma/adapter-pg |
| Database | PostgreSQL |
| Deployment | Docker Compose behind Nginx |
| Test | Jest/Vitest, Supertest, PostgreSQL integration, k6 |

## Core rules

- Backend เป็น security และ consistency boundary
- BFF และ Domain Controllers เรียก application services ชุดเดียวกัน — ดูรายละเอียดที่ [Hybrid BFF architecture](architecture/hybrid-bff.md)
- Prisma-generated type ห้ามเป็น public API contract
- PostgreSQL เป็น source of truth; frontend availability เป็นเพียง advisory

## Technical references

- [Prisma connection pool](https://docs.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections/connection-pool)
- [Prisma transactions](https://www.prisma.io/docs/orm/prisma-client/queries/transactions)
- [Prisma query best practices](https://www.prisma.io/docs/orm/more/best-practices)
- [Prisma pagination](https://www.prisma.io/docs/orm/prisma-client/queries/pagination)
- [PostgreSQL transaction isolation](https://www.postgresql.org/docs/current/transaction-iso.html)
- [PostgreSQL explicit locking](https://www.postgresql.org/docs/current/explicit-locking.html)
- [NestJS Fastify adapter](https://docs.nestjs.com/techniques/performance)
- [NestJS OpenAPI](https://docs.nestjs.com/openapi/introduction)
- [Vite production build](https://vite.dev/guide/build)
- [Nginx proxy module](https://nginx.org/en/docs/http/ngx_http_proxy_module.html)

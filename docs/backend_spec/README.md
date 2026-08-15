# Asset Reservation — Backend Specification

เอกสารนี้เป็น source of truth สำหรับการ implement backend ของระบบ Hybrid BFF แบบ on-premise

เอกสารที่เกี่ยวข้อง:

- [Software architecture](../software_spec/README.md)
- [File and schema structure conventions](../software_spec/file-and-schema-structure.md)
- [Frontend specification](../frontend_spec/README.md)
- [Database specification](../database.txt)
- [Prisma schema](../../backend/prisma/schema.prisma)

## Documentation structure

| เอกสาร                                                                                | เนื้อหา                                                      |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| [Hybrid BFF architecture](architecture/hybrid-bff.md)                                 | Layers, API surfaces, modules และ repository structure       |
| [API and authentication](detail/api-and-authentication.md)                            | REST/OpenAPI, DTO, idempotency, auth และ authorization       |
| [Auth and permission API contract](detail/authentication-and-permission-api.md)       | Endpoint, input/output, RBAC scope และ OpenAPI สำหรับ mock   |
| [API algorithm reference](detail/api-algorithms.md)                                   | Algorithm, permission, transaction และ error ของทุก endpoint |
| [OpenAPI contract](contracts/README.md)                                               | โครงสร้าง contract แบบ modular และวิธีสร้าง Swagger bundle   |
| [Database and concurrency](detail/database-and-concurrency.md)                        | Connection pool, transaction, retry, constraints และ indexes |
| [Performance, deployment and operations](detail/performance-deployment-operations.md) | Server load, Docker Compose, config, logging และ backup      |
| [Testing and acceptance](detail/testing-and-acceptance.md)                            | Test strategy, NFR, acceptance และ implementation sequence   |

## Backend stack

| Layer       | Technology                                         |
| ----------- | -------------------------------------------------- |
| Runtime/API | Node.js, NestJS, Fastify                           |
| Contract    | REST, OpenAPI                                      |
| ORM         | Prisma ORM 7                                       |
| Driver      | pg, @prisma/adapter-pg                             |
| Database    | PostgreSQL                                         |
| Deployment  | Docker Compose behind Nginx                        |
| Test        | Jest/Vitest, Supertest, PostgreSQL integration, k6 |

## Core rules

- Backend เป็น security และ consistency boundary
- BFF และ Domain Controllers เรียก application services ชุดเดียวกัน
- BFF ห้ามเรียก Prisma โดยตรง
- Prisma-generated type ห้ามเป็น public API contract
- Critical writes ต้อง atomic และ concurrency-safe
- Backend ใช้ PrismaClient singleton ต่อ process
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

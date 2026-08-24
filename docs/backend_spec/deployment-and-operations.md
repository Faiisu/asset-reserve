# Deployment and operations

[← Backend specification](README.md)

Frontend/browser performance techniques (debounce, code splitting, query caching) ย้ายไป [frontend_spec/engineering-conventions-frontend.md](../frontend_spec/engineering-conventions-frontend.md) — เอกสารนี้ครอบคลุมเฉพาะ backend/database load reduction, deployment topology, configuration และ operations

## Server-load reduction (backend/database)

- ใช้ cursor pagination สำหรับ list ขนาดใหญ่
- จำกัด page size ค่าเริ่มต้น 20 และสูงสุด 100
- ใช้ Prisma `select` เพื่อส่งเฉพาะ field ที่ต้องใช้
- ห้าม query relation ใน loop ซึ่งทำให้เกิด N+1
- ใช้ `createMany`/`updateMany` เมื่อ semantics อนุญาต
- แยก summary endpoint จาก detail endpoint
- Availability endpoint รับ asset IDs/date range ที่จำเป็นเท่านั้น
- ใช้ compression ที่ Nginx สำหรับ JSON/text ตามขนาดขั้นต่ำที่กำหนด

ไม่มี application data cache ใน backend ระยะ concept Static asset browser caching ของไฟล์ที่มี content hash สามารถใช้ได้เพราะไม่กระทบ consistency ของข้อมูลธุรกิจ

## On-premise deployment

```text
deploy/
├── dev/    docker-compose.yml   -- single stack, rebuilds from source every deploy, db:seed/db:reset via --profile tools
└── prod/   database/, backend/, frontend/  -- three independent Compose stacks, each redeployable without touching the others' data
    ├── nginx (frontend stack)
    │   ├── serves frontend/dist
    │   └── proxies /api to backend:3000
    ├── backend
    │   └── one NestJS/Fastify process
    └── postgres
        └── persistent SSD-backed volume, survives `down`/redeploy (only `down -v` wipes it)
```

ดู [`deploy/dev/README.md`](../../deploy/dev/README.md) และ [`deploy/prod/README.md`](../../deploy/prod/README.md) สำหรับคำสั่ง deploy ที่ใช้จริง

Requirements:

- Database port ห้าม expose นอก trusted host/network โดยไม่จำเป็น
- Nginx เป็น public entrypoint เดียว
- Container มี health check และ restart policy
- PostgreSQL data directory อยู่บน persistent volume
- Migration รันเป็น deployment step เดียวก่อนเริ่ม backend version ใหม่
- ห้ามให้ backend หลาย instance รัน migration พร้อมกัน
- เครื่องต้อง sync เวลาด้วย NTP
- Production secret ห้ามคอมมิตลง repository

## Configuration

### Backend required

| Variable | Purpose | Example |
| --- | --- | --- |
| `DATABASE_URL` | PostgreSQL connection | `postgresql://app:secret@postgres:5432/asset_reservation` |
| `JWT_SECRET` | Sign access token | Secret อย่างน้อย 32 characters |
| `CORS_ORIGINS` | Allowed frontend origins คั่นด้วย comma | `https://asset.internal.example` |
| `PORT` | Backend listen port | `3000` |

Connection pool ที่ implementation รองรับมี `DATABASE_POOL_MAX` (default `10`) และ `DATABASE_CONNECTION_TIMEOUT_MS` (default `5000`) ส่วน serializable transaction retry ใช้ 3 attempts แบบคงที่ ดู [Database and concurrency](database-and-concurrency.md)

### Other backend tuning

| Variable | Default | Purpose |
| --- | --- | --- |
| `JWT_ACCESS_TTL_SECONDS` | `900` (`28800` ใน root Compose) | อายุ access token เป็นวินาที |
| `TRUST_PROXY` | `false` | เชื่อ proxy headers เมื่อรันหลัง reverse proxy |
| `RECOGNITION_SERVICE_URL` | `http://localhost:8000` | Internal recognition service URL |

Email, OAuth/account-linking และ secret-encryption variables เป็น optional groups ตามตัวอย่างใน `.env.example`; ถ้าตั้งค่า provider บางส่วน backend จะ fail fast เพื่อไม่ให้เริ่มระบบด้วย config ที่ใช้ไม่ได้

### Frontend required

| Variable | Purpose | Example |
| --- | --- | --- |
| `VITE_API_BASE_URL` | API base URL | `/api/v1` |

Environment values ต้อง validate ตอน application startup หาก required value ขาด backend ต้อง fail fast พร้อมข้อความที่ไม่เปิดเผย secret

## Observability และ operations

- ปัจจุบันใช้ NestJS/Fastify default logging; ยังไม่มี Pino structured log หรือ application-level request ID
- ห้าม log password, access token, passwordHash หรือ sensitive provider identity
- Docker healthcheck ปัจจุบัน probe `GET /api/v1/auth/me` และถือ response ที่ต่ำกว่า 500 ว่าพร้อม; ยังไม่มี liveness/readiness endpoint แยกหรือ database readiness probe
- เปิด PostgreSQL slow-query visibility เช่น `pg_stat_statements` เมื่อ environment รองรับ
- Application metrics (request latency, error rate, active DB connections, pool wait และ transaction retries) ยังไม่ได้ implement

### Backup

- Concept baseline: backup database อย่างน้อยวันละครั้ง
- ทดสอบ restore เป็นรอบ ไม่ถือว่า backup สำเร็จเพียงเพราะไฟล์ถูกสร้าง
- Backup ต้องอยู่นอก PostgreSQL data volume
- เป้าหมายเริ่มต้น: RPO 24 ชั่วโมง และ RTO 4 ชั่วโมง ปรับตามข้อกำหนดองค์กร

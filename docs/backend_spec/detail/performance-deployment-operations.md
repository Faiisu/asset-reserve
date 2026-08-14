# Performance, deployment and operations

[← Backend specification](../README.md)

## Server-load reduction

### Frontend/browser

- Frontend build เป็น static files และเสิร์ฟโดย Nginx
- Route-level code splitting
- Search debounce 300–500 ms
- Cancel stale request ด้วย AbortController
- Calendar query เฉพาะ visible date range
- Refetch เมื่อ mutation สำเร็จหรือ browser กลับมา focus
- หลีกเลี่ยง polling; หากจำเป็นใช้ 30–60 วินาทีเฉพาะหน้าที่เปิด
- TanStack Query ใช้ deduplication ภายใน browser แต่ไม่มี shared server cache

### Backend/database

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
Docker Compose
├── nginx
│   ├── serves frontend/dist
│   └── proxies /api to backend:3000
├── backend
│   └── one NestJS/Fastify process
└── postgres
    └── persistent SSD-backed volume
```

Requirements:

- Database port ห้าม expose นอก trusted host/network โดยไม่จำเป็น
- Nginx เป็น public entrypoint เดียว
- Container มี health check และ restart policy
- PostgreSQL data directory อยู่บน persistent volume
- Migration รันเป็น deployment step เดียวก่อนเริ่ม backend version ใหม่
- ห้ามให้ backend หลาย instance รัน migration พร้อมกัน
- เครื่องต้อง sync เวลาด้วย NTP
- Production secret ห้าม commit ลง repository

## Configuration

### Backend required

| Variable            | Purpose                 | Example                                                   |
| ------------------- | ----------------------- | --------------------------------------------------------- |
| `DATABASE_URL`      | PostgreSQL connection   | `postgresql://app:secret@postgres:5432/asset_reservation` |
| `JWT_ACCESS_SECRET` | Sign access token       | Secret อย่างน้อย 32 bytes                                 |
| `CORS_ORIGIN`       | Allowed frontend origin | `https://asset.internal.example`                          |
| `PORT`              | Backend listen port     | `3000`                                                    |

### Backend tuning

| Variable                    | Default | Purpose                                |
| --------------------------- | ------- | -------------------------------------- |
| `DB_POOL_MAX`               | `10`    | Maximum pg connections                 |
| `DB_CONNECT_TIMEOUT_MS`     | `5000`  | Connection acquisition/connect timeout |
| `DB_IDLE_TIMEOUT_MS`        | `30000` | Close idle connection                  |
| `DB_TRANSACTION_TIMEOUT_MS` | `10000` | Critical transaction timeout           |
| `DB_TRANSACTION_RETRIES`    | `3`     | Serializable conflict retries          |
| `LOG_LEVEL`                 | `info`  | Structured log level                   |
| `REQUEST_TIMEOUT_MS`        | `15000` | API request timeout                    |

### Frontend required

| Variable            | Purpose      | Example   |
| ------------------- | ------------ | --------- |
| `VITE_API_BASE_URL` | API base URL | `/api/v1` |

Environment values ต้อง validate ตอน application startup หาก required value ขาด backend ต้อง fail fast พร้อมข้อความที่ไม่เปิดเผย secret

## Observability และ operations

- Structured JSON logs ผ่าน Pino
- ทุก request มี request ID และคืนใน error response
- Log method, route, status, duration และ actor ID เมื่อเหมาะสม
- ห้าม log password, access token, passwordHash หรือ sensitive provider identity
- Health endpoints แยก liveness และ readiness
- Readiness ต้องตรวจ database connection ด้วย lightweight query
- เปิด PostgreSQL slow-query visibility เช่น `pg_stat_statements` เมื่อ environment รองรับ
- เก็บ metric อย่างน้อย request latency, error rate, active DB connections, pool wait และ transaction retries

### Backup

- Concept baseline: backup database อย่างน้อยวันละครั้ง
- ทดสอบ restore เป็นรอบ ไม่ถือว่า backup สำเร็จเพียงเพราะไฟล์ถูกสร้าง
- Backup ต้องอยู่นอก PostgreSQL data volume
- เป้าหมายเริ่มต้น: RPO 24 ชั่วโมง และ RTO 4 ชั่วโมง ปรับตามข้อกำหนดองค์กร

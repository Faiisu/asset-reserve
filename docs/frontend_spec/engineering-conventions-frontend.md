# Frontend engineering conventions

[← กลับไปสารบัญ](README.md)

มาตรฐานโครงสร้างไฟล์และ naming convention ของ frontend เป้าหมายคือให้ผู้พัฒนาตัดสินใจได้ว่าไฟล์ใหม่ควรอยู่ที่ใดและ dependency ควรชี้ไปทางไหน โครงสร้างนี้เป็น **target structure** ไม่จำเป็นต้องสร้างทุกโฟลเดอร์ล่วงหน้า ให้สร้างเมื่อมี implementation จริงอย่างน้อยหนึ่งรายการ

## โครงสร้างเป้าหมาย

```text
frontend/
├── public/                         # Static files ที่ไม่ผ่าน bundler
├── src/
│   ├── app/
│   │   ├── App.tsx                 # Root application shell
│   │   ├── router.tsx              # Route definitions
│   │   └── providers.tsx           # Global providers
│   ├── pages/
│   │   ├── calendar/
│   │   │   └── CalendarPage.tsx
│   │   └── reservation-detail/
│   │       └── ReservationDetailPage.tsx
│   ├── features/
│   │   └── reservations/
│   │       ├── api/                # Feature query/mutation functions
│   │       ├── components/         # UI ที่ใช้เฉพาะ feature
│   │       ├── hooks/              # Feature orchestration hooks
│   │       ├── model/              # UI state และ pure domain helpers
│   │       ├── schemas/            # Form/runtime validation
│   │       └── index.ts            # Public exports ของ feature
│   ├── components/
│   │   └── ui/                     # Reusable presentation components
│   ├── api/
│   │   ├── client.ts               # HTTP client, auth header, error mapping
│   │   └── generated/              # Generated OpenAPI client; ห้ามแก้มือ
│   ├── shared/
│   │   ├── hooks/
│   │   ├── lib/
│   │   └── types/
│   ├── styles/                     # Tokens และ global styles
│   ├── test/                       # Shared test setup/factories
│   └── main.tsx                    # Browser entrypoint
├── Dockerfile
├── nginx.conf
├── vite.config.ts
└── package.json
```

ไม่ต้องสร้างทุก directory ตั้งแต่วันแรก Feature ขนาดเล็กเริ่มจาก component, API function และ test ในโฟลเดอร์เดียวได้ แล้วค่อยแยก `api/`, `hooks/` หรือ `model/` เมื่อมีไฟล์มากกว่าหนึ่งชนิดหรือ responsibility เริ่มปะปนกัน

## หน้าที่ของแต่ละ layer

| Layer            | ทำอะไรได้                                                    | ห้ามทำ                                   |
| ----------------- | -------------------------------------------------------------- | ------------------------------------------ |
| `app/`            | Bootstrap, router, global provider, error boundary              | Business rule ราย feature                  |
| `pages/`          | ประกอบหลาย feature ให้เป็น route/page                          | เรียก database หรือเขียน HTTP client ซ้ำ   |
| `features/`       | Use case ของผู้ใช้, feature UI, query/mutation orchestration    | Import page หรือ app layer                 |
| `components/ui/`  | Component ทั่วไปที่ไม่รู้ business domain                      | Fetch API หรือรู้ reservation state        |
| `api/`            | Transport, generated client, auth/error mapping                | UI state และ visual behavior               |
| `shared/`         | Utility/type/hook ที่ใช้ข้าม feature จริง                      | เป็นที่ทิ้งไฟล์ที่จัดหมวดไม่ได้            |

## Dependency rules

```text
main → app → pages → features → api/shared
                         └────→ components/ui
```

- `pages` import feature ได้หลายตัวเพื่อประกอบหน้าจอ
- feature ห้าม import `pages` หรือ `app`
- feature หนึ่งไม่ควร import internal file ของอีก feature ให้ใช้ public export จาก `index.ts` หรือย้าย orchestration ไป page
- component ใน `components/ui` รับข้อมูลผ่าน props และส่ง event ผ่าน callback; ห้ามรู้ endpoint หรือ permission policy เฉพาะ domain
- frontend DTO มาจาก OpenAPI contract ส่วน UI model/computed state แยกจาก DTO เมื่อ shape ไม่เหมือนกัน

## State placement

| State                                                     | ตำแหน่งแนะนำ               |
| ----------------------------------------------------------- | --------------------------- |
| Input ที่ใช้ใน component เดียว                            | Local component state       |
| Form หลาย field                                            | Feature form hook/schema    |
| Server data                                                | Query layer ภายใน feature   |
| Session และ app-wide provider                              | `app/providers.tsx`         |
| URL filter, pagination, selected tab ที่ share link ได้    | Router/search params        |

อย่าคัดลอก server data ลง global state โดยไม่มีเหตุผล เพราะจะสร้าง source of truth ซ้ำ Frontend cache เป็นข้อมูลชั่วคราวและ backend ต้องตรวจ business rule ซ้ำทุก mutation

## Naming conventions

- React component และไฟล์ component ใช้ `PascalCase.tsx` เช่น `ReservationCard.tsx`
- Hook ใช้ `useXxx.ts` เช่น `useReservationForm.ts`
- Utility และ API module ใช้ `kebab-case.ts` หรือชื่อ domain ที่สม่ำเสมอ เช่น `reservation-api.ts`
- Test ใช้ชื่อเดียวกับไฟล์หลักตามด้วย `.test.ts` หรือ `.test.tsx`
- Route component ลงท้าย `Page`; reusable visual component ไม่ใช้คำว่า `Page`
- หลีกเลี่ยงไฟล์ชื่อกว้างเกินไป เช่น `helpers.ts`, `utils.ts`, `types.ts` ภายใน feature หากสามารถตั้งชื่อตามหน้าที่ได้ชัดกว่า

## Client-side performance

- Route-level code splitting
- Search debounce 300–500 ms
- Cancel stale request ด้วย `AbortController`
- Calendar query เฉพาะ visible date range เท่านั้น
- Refetch เมื่อ mutation สำเร็จหรือ browser กลับมา focus
- หลีกเลี่ยง polling; หากจำเป็นใช้ 30–60 วินาทีเฉพาะหน้าที่เปิด
- TanStack Query ใช้ deduplication ภายใน browser แต่ไม่มี shared server cache (ไม่มี server-side cache ในระบบนี้ — ดู [backend_spec/deployment-and-operations.md](../backend_spec/deployment-and-operations.md))

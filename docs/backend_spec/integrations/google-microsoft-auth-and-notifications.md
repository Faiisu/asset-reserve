# Google/Microsoft account linking and email notifications

[← Backend specification](../README.md)

เอกสารนี้อธิบาย current-state design ของสามความสามารถที่เกี่ยวข้องกัน: email notification (SMTP), account linking กับ Google/Microsoft (OAuth), และ Google Calendar sync สำหรับ manual setup steps (Google Cloud Console, Azure Portal, dev/deploy toggle) ดู [OAuth setup](oauth-setup.md)

## Email notifications

**Module:** `backend/src/email/` ทำงานผ่าน reservation lifecycle event bus (`backend/src/common/reservation-lifecycle.events.ts`, `@Global()` module) ซึ่งเป็น pattern เดียวกับ `AssetLifecycleEvents` ที่ `RecognitionModule` ใช้อยู่แล้ว

- `EmailService` อ่าน SMTP config จาก `appConfig.smtp()` ครั้งเดียวตอน startup ถ้า `SMTP_USER`/`SMTP_APP_PASSWORD` ไม่ครบทั้งคู่ ฟีเจอร์นี้ปิด (transporter เป็น `null`) และการส่งทุกครั้ง no-op พร้อม `console.warn` — backend boot ได้ตามปกติแม้ไม่ตั้งค่า SMTP
- `EmailLifecycleListener` (`OnModuleInit`) subscribe เหตุการณ์ `submitted`, `decided`, `cancelled`, `returnDecided` แบบ fire-and-forget (`void`) — การส่งอีเมลไม่เคย block หรือ rollback primary write
- Event ถูก emit **หลัง** transaction commit เสมอ ไม่ใช่ภายใน transaction — จุด emit อยู่ที่ `ReservationsService.submit()` (เฉพาะ path ที่ไป `PENDING_APPROVAL`), `ReservationsService.decideItems()`, `ReservationsService.cancel()`, และ `ReturnsService.decide()`
- ผู้รับอีเมล "submitted" คำนวณจาก `UserRole` ที่ `managementAreaId` เป็น `null` (global) หรือตรงกับ area ที่เกี่ยวข้อง กรองด้วย permission `reservation:approve`
- `nodemailer` ผ่าน Gmail SMTP + App Password (ไม่ใช้ Gmail API/OAuth2 — setup น้อยกว่า)

**Admin-configurable templates:** `backend/src/email-templates/` module เก็บ template ต่อ situation ใน database (`email_templates` table) รองรับ bold/italic/H1-3 และ `{{placeholder}}` (ไม่รองรับ raw HTML) พร้อม live preview และ reset-to-default จากหน้า Notification → Templates ในแอป ถ้าไม่มี row สำหรับ situation นั้น ระบบ fallback ไปใช้ template เดิมที่ hardcode ไว้ (`EmailService.resolveContent()`) — ดู route/contract ที่ [Email templates module](../modules/email-templates.md)

## Account linking (Google + Microsoft)

แอปเป็น invite-only — บัญชีสร้างโดย admin เท่านั้น (username + password, ไม่เก็บ email ตอนสร้าง) OAuth sign-in ใช้เพื่อ **link** เข้าบัญชีที่มีอยู่แล้วเท่านั้น ไม่เคย auto-provision บัญชีใหม่

- Model `UserAuthIdentity` (`prisma/models/users.prisma`) เก็บ `[provider, providerUserId]` แบบ composite unique — provider-agnostic
- `google-auth` และ `microsoft-auth` module ต่างมี route รูปแบบเดียวกัน: `GET /login` (public, ใช้สำหรับ sign-in ปกติถ้าเคย link แล้ว), `GET /connect` (authenticated, บังคับ consent ใหม่เพื่อให้ได้ refresh token), `GET /callback` (public, แยก flow ด้วย signed state token ที่มี `purpose: "login" | "connect"`)
- Callback flow `"login"`: verify token → ถ้ามี `UserAuthIdentity` อยู่แล้ว log in ทันที ถ้ายังไม่มี ให้ lookup `User` ด้วย email (เทียบ lowercase) — พบ → link แล้ว log in, ไม่พบ → redirect พร้อม error `no_account` (**ไม่สร้าง user ใหม่เด็ดขาด**) บัญชีที่ inactive → error `inactive`
- **Mandatory-link gate:** `AccountLinkGuard` บังคับผู้ใช้ทุกคนไป `/connect-account` จนกว่าจะ link provider ใดก็ได้อย่างน้อยหนึ่งตัว การเปิด/ปิด gate ควบคุมด้วย `REQUIRE_ACCOUNT_LINK` — รายละเอียดที่ [OAuth setup §1](oauth-setup.md#1-how-the-mode-toggle-works)
- **Optional-link mode:** เมื่อ gate ปิด (`REQUIRE_ACCOUNT_LINK=false`) ผู้ใช้จัดการ notification email/name/password เองผ่านหน้า self-service `/account` โดยไม่ต้อง link อะไรเลย — Google/Microsoft ยังเสนอเป็นทางเลือกเสริม
- Microsoft ไม่มี profile picture ใน ID token (ต่างจาก Google) — field profile picture ของผู้ใช้ที่ link ผ่าน Microsoft จะไม่ถูกตั้งค่า

## Google Calendar sync

ยังไม่ implement — เป็น design ที่วางแผนไว้ ต่อยอดจาก `/connect` callback เดิมด้วย scope เพิ่มเติม (`calendar.events`) และ module ใหม่ `backend/src/google-calendar/` ที่ผูกกับ `onDecided`/`onCancelled` event เดียวกับที่ email ใช้ (best-effort, ไม่ block primary write, unconnected user = silent skip) สถานะการ implement จริง ดู [Implementation status](../../status/implementation-status.md)

## Configuration reference

ตัวแปร environment ทั้งหมด (`GOOGLE_CLIENT_ID`, `MICROSOFT_CLIENT_ID`, `SMTP_USER`, `TOKEN_ENCRYPTION_KEY` ฯลฯ) และขั้นตอนสร้าง credential จริงบน Google Cloud Console / Azure Portal อยู่ที่ [OAuth setup](oauth-setup.md) ทั้งหมด — ไม่ restate ที่นี่

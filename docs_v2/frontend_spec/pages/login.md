# Login

[← กลับไปสารบัญ](../README.md)

## Authentication screen

หน้า first draft รองรับ password authentication:

- Username required — เป็น login identifier ที่ set ครั้งเดียวตอนสร้าง user (ดู [backend_spec/database-schema.md](../../backend_spec/database-schema.md)) **ไม่ใช่** email address
- Password required เฉพาะ flow ที่ใช้ password
- External identity (Google/Microsoft) ใช้งานได้แล้วสำหรับบัญชีที่ link ไว้แล้ว — `LoginPage` มี provider button ที่พาไป `/auth/callback` หลัง provider consent; บัญชีที่ยังไม่ link ต้องใช้ username/password ตามปกติ (ดู [implementation-status.md](../../status/implementation-status.md), [frontend_spec/README.md](../README.md))
- User ที่มี passwordHash เป็น null ต้องไม่เห็นข้อผิดพลาดที่เปิดเผยวิธี authentication ของบัญชีนั้น
- Login ไม่สำเร็จแสดงข้อความทั่วไป "Username or password is incorrect."
- User inactive ต้องไม่สามารถเข้าสู่ระบบหรือใช้ protected route
- Protected route redirect ไป /login พร้อม callback URL
- Login สำเร็จ redirect ไป /calendar

Session object ที่หน้านี้ใช้ (user, profile, roles, permissions, management-area scopes) มีรูปร่างตาม `SessionUser` schema ใน [backend_spec/contracts/components/schemas/authentication.yaml](../../backend_spec/contracts/components/schemas/authentication.yaml) — ไม่ restate field ที่นี่

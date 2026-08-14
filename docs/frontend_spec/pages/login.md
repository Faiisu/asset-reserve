# Login

[← กลับไปสารบัญ](../README.md)

## Authentication และ session

User รองรับ password authentication และ external identity:

- Email required
- Password required เฉพาะ flow ที่ใช้ password
- External provider button แสดงจาก provider ที่ backend เปิดใช้งาน เช่น google หรือ microsoft
- User ที่มี passwordHash เป็น null ต้องไม่เห็นข้อผิดพลาดที่เปิดเผยวิธี authentication ของบัญชีนั้น
- Login ไม่สำเร็จแสดงข้อความทั่วไป “Email or password is incorrect.”
- User.isActive=false ต้องไม่สามารถเข้าสู่ระบบหรือใช้ protected route
- Protected route redirect ไป /login พร้อม callback URL
- Login สำเร็จ redirect ไป /calendar

Session contract ขั้นต่ำต้องมี user, profile, roles, permissions และ management-area scopes

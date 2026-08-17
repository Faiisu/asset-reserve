import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { GoogleAuthController } from "./google-auth.controller.js";
import { GoogleAuthService } from "./google-auth.service.js";

@Module({
  // Reuses AuthModule's JwtService (for signState/verifyState and issuing
  // sessions the same way AuthService.login() does) and SessionService --
  // requires AuthModule to export JwtModule alongside SessionService.
  imports: [AuthModule],
  controllers: [GoogleAuthController],
  providers: [GoogleAuthService],
})
export class GoogleAuthModule {}

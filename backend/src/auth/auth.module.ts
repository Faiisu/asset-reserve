import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { JwtModule } from "@nestjs/jwt";
import { appConfig } from "../config.js";
import { AccessGuard } from "./access.guard.js";
import { AuthController, SessionBffController } from "./auth.controller.js";
import { AuthenticationGuard } from "./auth.guard.js";
import { AuthService } from "./auth.service.js";
import { SessionService } from "./session.service.js";

@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: appConfig.jwtSecret(),
        signOptions: { expiresIn: appConfig.jwtAccessTtlSeconds },
      }),
    }),
  ],
  controllers: [AuthController, SessionBffController],
  providers: [
    AuthService,
    SessionService,
    { provide: APP_GUARD, useClass: AuthenticationGuard },
    { provide: APP_GUARD, useClass: AccessGuard },
  ],
  exports: [SessionService],
})
export class AuthModule {}

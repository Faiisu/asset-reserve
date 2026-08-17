import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { JwtModule } from "@nestjs/jwt";
import { appConfig } from "../config.js";
import { AccessGuard } from "./access.guard.js";
import { AuthController, SessionBffController } from "./auth.controller.js";
import { AuthenticationGuard } from "./auth.guard.js";
import { AuthService } from "./auth.service.js";
import { GoogleLinkGuard } from "./google-link.guard.js";
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
    // Runs after AuthenticationGuard (needs request.actor populated) and
    // before AccessGuard (a link-required block takes precedence over a
    // permission-denied message).
    { provide: APP_GUARD, useClass: GoogleLinkGuard },
    { provide: APP_GUARD, useClass: AccessGuard },
  ],
  // JwtModule is exported too so GoogleAuthModule (imports: [AuthModule])
  // can reuse the same JwtService for state signing/verification and
  // session issuance, instead of a second, divergent registration.
  exports: [SessionService, JwtModule],
})
export class AuthModule {}

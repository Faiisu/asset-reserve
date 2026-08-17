import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { JwtModule } from "@nestjs/jwt";
import { appConfig } from "../config.js";
import { AccessGuard } from "./access.guard.js";
import { AuthController, SessionBffController } from "./auth.controller.js";
import { AccountLinkGuard } from "./account-link.guard.js";
import { AuthenticationGuard } from "./auth.guard.js";
import { AuthService } from "./auth.service.js";
import { ExternalIdentitySessionService } from "./external-identity-session.service.js";
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
    ExternalIdentitySessionService,
    { provide: APP_GUARD, useClass: AuthenticationGuard },
    // Runs after AuthenticationGuard (needs request.actor populated) and
    // before AccessGuard (a link-required block takes precedence over a
    // permission-denied message).
    { provide: APP_GUARD, useClass: AccountLinkGuard },
    { provide: APP_GUARD, useClass: AccessGuard },
  ],
  // JwtModule is exported too so GoogleAuthModule/MicrosoftAuthModule
  // (imports: [AuthModule]) can reuse the same JwtService (via
  // ExternalIdentitySessionService) for state signing/verification and
  // session issuance, instead of a second, divergent registration.
  exports: [SessionService, ExternalIdentitySessionService, JwtModule],
})
export class AuthModule {}

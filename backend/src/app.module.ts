import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { AccessControlModule } from "./access-control/access-control.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { AssetsModule } from "./assets/assets.module.js";
import { ReservationLifecycleModule } from "./common/reservation-lifecycle.module.js";
import { DatabaseModule } from "./database/database.module.js";
import { EmailModule } from "./email/email.module.js";
import { GoogleAuthModule } from "./google-auth/google-auth.module.js";
import { ManagementAreasModule } from "./management-areas/management-areas.module.js";
import { MicrosoftAuthModule } from "./microsoft-auth/microsoft-auth.module.js";
import { NotificationSettingsModule } from "./notification-settings/notification-settings.module.js";
import { EmailTemplatesModule } from "./email-templates/email-templates.module.js";
import { RecognitionModule } from "./recognition/recognition.module.js";
import { ReputationModule } from "./reputation/reputation.module.js";
import { ReservationsModule } from "./reservations/reservations.module.js";
import { ReturnsModule } from "./returns/returns.module.js";
import { UploadsModule } from "./uploads/uploads.module.js";
import { UsersModule } from "./users/users.module.js";

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    DatabaseModule,
    ReservationLifecycleModule,
    AuthModule,
    GoogleAuthModule,
    MicrosoftAuthModule,
    AssetsModule,
    AccessControlModule,
    UsersModule,
    ManagementAreasModule,
    ReservationsModule,
    ReturnsModule,
    UploadsModule,
    RecognitionModule,
    ReputationModule,
    EmailModule,
    NotificationSettingsModule,
    EmailTemplatesModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}

import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { AccessControlModule } from "./access-control/access-control.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { AssetsModule } from "./assets/assets.module.js";
import { ReservationLifecycleModule } from "./common/reservation-lifecycle.module.js";
import { DatabaseModule } from "./database/database.module.js";
import { EmailModule } from "./email/email.module.js";
import { ManagementAreasModule } from "./management-areas/management-areas.module.js";
import { NotificationSettingsModule } from "./notification-settings/notification-settings.module.js";
import { RecognitionModule } from "./recognition/recognition.module.js";
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
    AssetsModule,
    AccessControlModule,
    UsersModule,
    ManagementAreasModule,
    ReservationsModule,
    ReturnsModule,
    UploadsModule,
    RecognitionModule,
    EmailModule,
    NotificationSettingsModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}

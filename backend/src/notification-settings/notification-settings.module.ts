import { Module } from "@nestjs/common";
import { EmailModule } from "../email/email.module.js";
import { NotificationSettingsController } from "./notification-settings.controller.js";
import { NotificationSettingsService } from "./notification-settings.service.js";

@Module({
  imports: [EmailModule],
  controllers: [NotificationSettingsController],
  providers: [NotificationSettingsService],
})
export class NotificationSettingsModule {}

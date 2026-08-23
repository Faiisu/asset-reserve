import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
} from "@nestjs/common";
import { CurrentActor, RequireGlobalAdmin } from "../auth/auth.decorators.js";
import type { AuthenticatedActor } from "../auth/auth.types.js";
import { UpdateNotificationSettingsDto } from "./notification-settings.dto.js";
import { NotificationSettingsService } from "./notification-settings.service.js";

@Controller("notification-settings")
@RequireGlobalAdmin()
export class NotificationSettingsController {
  constructor(private readonly settings: NotificationSettingsService) {}

  @Get()
  get() {
    return this.settings.get();
  }

  @Patch()
  update(
    @CurrentActor() actor: AuthenticatedActor,
    @Body() dto: UpdateNotificationSettingsDto,
  ) {
    return this.settings.update(actor.user.id, dto);
  }

  @Post("test")
  @HttpCode(HttpStatus.OK)
  sendTest(@CurrentActor() actor: AuthenticatedActor) {
    return this.settings.sendTest(actor.user.email);
  }
}

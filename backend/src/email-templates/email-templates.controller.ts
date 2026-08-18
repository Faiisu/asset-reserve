import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from "@nestjs/common";
import { CurrentActor, RequireGlobalAdmin } from "../auth/auth.decorators.js";
import type { AuthenticatedActor } from "../auth/auth.types.js";
import {
  PreviewEmailTemplateDto,
  UpdateEmailTemplateDto,
} from "./email-templates.dto.js";
import { EmailTemplatesService } from "./email-templates.service.js";

@Controller("email-templates")
@RequireGlobalAdmin()
export class EmailTemplatesController {
  constructor(private readonly templates: EmailTemplatesService) {}

  @Get()
  list() {
    return this.templates.list();
  }

  @Get(":situation")
  get(@Param("situation") situation: string) {
    return this.templates.get(situation);
  }

  @Patch(":situation")
  update(
    @CurrentActor() actor: AuthenticatedActor,
    @Param("situation") situation: string,
    @Body() dto: UpdateEmailTemplateDto,
  ) {
    return this.templates.update(actor.user.id, situation, dto);
  }

  @Delete(":situation")
  resetToDefault(@Param("situation") situation: string) {
    return this.templates.resetToDefault(situation);
  }

  @Post(":situation/preview")
  @HttpCode(200)
  preview(
    @Param("situation") situation: string,
    @Body() dto: PreviewEmailTemplateDto,
  ) {
    return this.templates.preview(situation, dto);
  }
}

import { Module } from "@nestjs/common";
import { EmailTemplatesController } from "./email-templates.controller.js";
import { EmailTemplatesService } from "./email-templates.service.js";

@Module({
  controllers: [EmailTemplatesController],
  providers: [EmailTemplatesService],
})
export class EmailTemplatesModule {}

import { Module } from "@nestjs/common";
import { EmailLifecycleListener } from "./email-lifecycle.listener.js";
import { EmailService } from "./email.service.js";

@Module({
  providers: [EmailService, EmailLifecycleListener],
  exports: [EmailService],
})
export class EmailModule {}

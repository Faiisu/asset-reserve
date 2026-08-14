import { Module } from "@nestjs/common";
import { AccessControlController } from "./access-control.controller.js";
import { AccessControlService } from "./access-control.service.js";

@Module({
  controllers: [AccessControlController],
  providers: [AccessControlService],
})
export class AccessControlModule {}

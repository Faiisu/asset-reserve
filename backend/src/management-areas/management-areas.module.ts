import { Module } from "@nestjs/common";
import { ManagementAreasController } from "./management-areas.controller.js";
import { ManagementAreasService } from "./management-areas.service.js";

@Module({
  controllers: [ManagementAreasController],
  providers: [ManagementAreasService],
})
export class ManagementAreasModule {}

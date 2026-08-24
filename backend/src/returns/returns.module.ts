import { Module } from "@nestjs/common";
import { ReputationModule } from "../reputation/reputation.module.js";
import { ReturnsController } from "./returns.controller.js";
import { ReturnsService } from "./returns.service.js";

@Module({
  imports: [ReputationModule],
  controllers: [ReturnsController],
  providers: [ReturnsService],
  exports: [ReturnsService],
})
export class ReturnsModule {}

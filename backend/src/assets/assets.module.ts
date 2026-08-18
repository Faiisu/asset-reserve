import { Module } from "@nestjs/common";
import { AssetsController } from "./assets.controller.js";
import { AssetsService } from "./assets.service.js";
import { InventoryService } from "./inventory.service.js";

@Module({
  controllers: [AssetsController],
  providers: [AssetsService, InventoryService],
  exports: [AssetsService],
})
export class AssetsModule {}

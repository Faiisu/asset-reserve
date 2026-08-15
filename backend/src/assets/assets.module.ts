import { Module } from "@nestjs/common";
import { AssetTemplatesService } from "./asset-templates.service.js";
import {
  AssetsController,
  AssetTemplatesController,
} from "./assets.controller.js";
import { AssetsService } from "./assets.service.js";
import { InventoryService } from "./inventory.service.js";

@Module({
  controllers: [AssetsController, AssetTemplatesController],
  providers: [AssetsService, InventoryService, AssetTemplatesService],
})
export class AssetsModule {}

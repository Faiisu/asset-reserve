import { Module } from "@nestjs/common";
import { AssetUnitsService } from "./asset-units.service.js";
import { AssetsController } from "./assets.controller.js";
import { AssetsService } from "./assets.service.js";

@Module({
  controllers: [AssetsController],
  providers: [AssetsService, AssetUnitsService],
  exports: [AssetsService, AssetUnitsService],
})
export class AssetsModule {}

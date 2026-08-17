import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { CurrentActor } from "../auth/auth.decorators.js";
import type { AuthenticatedActor } from "../auth/auth.types.js";
import {
  AssetListQueryDto,
  BatchCreateAssetsDto,
  BatchRemoveAssetsDto,
  CreateAssetDto,
  InventoryBatchDto,
  UpdateAssetDto,
  UpdateAssetStatusDto,
} from "./assets.dto.js";
import { AssetsService } from "./assets.service.js";
import { InventoryService } from "./inventory.service.js";

@Controller("assets")
export class AssetsController {
  constructor(
    private readonly assets: AssetsService,
    private readonly inventory: InventoryService,
  ) {}

  @Get()
  list(
    @CurrentActor() actor: AuthenticatedActor,
    @Query() query: AssetListQueryDto,
  ) {
    return this.assets.list(actor, query);
  }

  @Post()
  create(
    @CurrentActor() actor: AuthenticatedActor,
    @Body() input: CreateAssetDto,
  ) {
    return this.assets.create(actor, input);
  }

  @Post("batch")
  createBatch(
    @CurrentActor() actor: AuthenticatedActor,
    @Body() input: BatchCreateAssetsDto,
  ) {
    return this.assets.createBatch(actor, input);
  }

  @Post("batch-remove")
  deactivateBatch(
    @CurrentActor() actor: AuthenticatedActor,
    @Body() input: BatchRemoveAssetsDto,
  ) {
    return this.assets.deactivateBatch(actor, input);
  }

  @Post("inventory/batch-add")
  addInventory(
    @CurrentActor() actor: AuthenticatedActor,
    @Body() input: InventoryBatchDto,
  ) {
    return this.inventory.add(actor, input);
  }

  @Post("inventory/batch-remove")
  removeInventory(
    @CurrentActor() actor: AuthenticatedActor,
    @Body() input: InventoryBatchDto,
  ) {
    return this.inventory.remove(actor, input);
  }

  @Get(":assetId")
  get(
    @CurrentActor() actor: AuthenticatedActor,
    @Param("assetId", new ParseUUIDPipe()) assetId: string,
  ) {
    return this.assets.get(actor, assetId);
  }

  @Patch(":assetId")
  update(
    @CurrentActor() actor: AuthenticatedActor,
    @Param("assetId", new ParseUUIDPipe()) assetId: string,
    @Body() input: UpdateAssetDto,
  ) {
    return this.assets.update(actor, assetId, input);
  }

  @Patch(":assetId/status")
  updateStatus(
    @CurrentActor() actor: AuthenticatedActor,
    @Param("assetId", new ParseUUIDPipe()) assetId: string,
    @Body() input: UpdateAssetStatusDto,
  ) {
    return this.assets.updateStatus(actor, assetId, input);
  }

  @Delete(":assetId")
  deactivate(
    @CurrentActor() actor: AuthenticatedActor,
    @Param("assetId", new ParseUUIDPipe()) assetId: string,
  ) {
    return this.assets.deactivate(actor, assetId);
  }
}

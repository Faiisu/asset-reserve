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
import { SearchPaginationQueryDto } from "../common/dto.js";
import { AssetTemplatesService } from "./asset-templates.service.js";
import {
  AssetListQueryDto,
  BatchCreateAssetsDto,
  BatchRemoveAssetsDto,
  CreateAssetDto,
  CreateAssetTemplateDto,
  InventoryBatchDto,
  SaveAssetAsTemplateDto,
  UpdateAssetDto,
  UpdateAssetStatusDto,
  UpdateAssetTemplateDto,
} from "./assets.dto.js";
import { AssetsService } from "./assets.service.js";
import { InventoryService } from "./inventory.service.js";

@Controller("assets")
export class AssetsController {
  constructor(
    private readonly assets: AssetsService,
    private readonly inventory: InventoryService,
    private readonly templates: AssetTemplatesService,
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

  @Post(":assetId/template")
  saveAsTemplate(
    @CurrentActor() actor: AuthenticatedActor,
    @Param("assetId", new ParseUUIDPipe()) assetId: string,
    @Body() input: SaveAssetAsTemplateDto,
  ) {
    return this.templates.saveFromAsset(actor, assetId, input);
  }
}

@Controller("asset-templates")
export class AssetTemplatesController {
  constructor(private readonly templates: AssetTemplatesService) {}

  @Get()
  list(
    @CurrentActor() actor: AuthenticatedActor,
    @Query() query: SearchPaginationQueryDto,
  ) {
    return this.templates.list(actor, query);
  }

  @Post()
  create(
    @CurrentActor() actor: AuthenticatedActor,
    @Body() input: CreateAssetTemplateDto,
  ) {
    return this.templates.create(actor, input);
  }

  @Patch(":templateId")
  update(
    @CurrentActor() actor: AuthenticatedActor,
    @Param("templateId", new ParseUUIDPipe()) templateId: string,
    @Body() input: UpdateAssetTemplateDto,
  ) {
    return this.templates.update(actor, templateId, input);
  }
}

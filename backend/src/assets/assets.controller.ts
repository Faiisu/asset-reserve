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
import { AssetUnitsService } from "./asset-units.service.js";
import {
  AssetListQueryDto,
  AssetUnitListQueryDto,
  AssetUnitSearchQueryDto,
  BatchCreateAssetsDto,
  BatchRemoveAssetsDto,
  CreateAssetDto,
  RegisterAssetUnitsDto,
  RetireAssetUnitsDto,
  UpdateAssetDto,
  UpdateAssetStatusDto,
  UpdateAssetUnitStatusDto,
} from "./assets.dto.js";
import { AssetsService } from "./assets.service.js";

@Controller("assets")
export class AssetsController {
  constructor(
    private readonly assets: AssetsService,
    private readonly assetUnits: AssetUnitsService,
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

  @Get("units")
  searchUnits(
    @CurrentActor() actor: AuthenticatedActor,
    @Query() query: AssetUnitSearchQueryDto,
  ) {
    return this.assetUnits.search(actor, query);
  }

  @Get("units/:assetUnitId/events")
  unitHistory(
    @CurrentActor() actor: AuthenticatedActor,
    @Param("assetUnitId", new ParseUUIDPipe()) assetUnitId: string,
  ) {
    return this.assetUnits.getHistory(actor, assetUnitId);
  }

  @Post("units/batch-retire")
  retireUnits(
    @CurrentActor() actor: AuthenticatedActor,
    @Body() input: RetireAssetUnitsDto,
  ) {
    return this.assetUnits.retire(actor, input);
  }

  @Patch("units/:assetUnitId/status")
  updateUnitStatus(
    @CurrentActor() actor: AuthenticatedActor,
    @Param("assetUnitId", new ParseUUIDPipe()) assetUnitId: string,
    @Body() input: UpdateAssetUnitStatusDto,
  ) {
    return this.assetUnits.updateStatus(actor, assetUnitId, input);
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

  @Get(":assetId/units")
  listUnits(
    @CurrentActor() actor: AuthenticatedActor,
    @Param("assetId", new ParseUUIDPipe()) assetId: string,
    @Query() query: AssetUnitListQueryDto,
  ) {
    return this.assetUnits.list(actor, assetId, query);
  }

  @Post(":assetId/units")
  registerUnits(
    @CurrentActor() actor: AuthenticatedActor,
    @Param("assetId", new ParseUUIDPipe()) assetId: string,
    @Body() input: RegisterAssetUnitsDto,
  ) {
    return this.assetUnits.register(actor, assetId, input);
  }
}

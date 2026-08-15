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
import { SearchPaginationQueryDto } from "../common/dto.js";
import { RequireGlobalAdmin } from "../auth/auth.decorators.js";
import {
  CreateManagementAreaDto,
  UpdateManagementAreaDto,
} from "./management-areas.dto.js";
import { ManagementAreasService } from "./management-areas.service.js";

@Controller("management-areas")
export class ManagementAreasController {
  constructor(private readonly areas: ManagementAreasService) {}

  @Get()
  list(@Query() query: SearchPaginationQueryDto) {
    return this.areas.list(query);
  }

  @Get(":id")
  @RequireGlobalAdmin()
  get(@Param("id", ParseUUIDPipe) id: string) {
    return this.areas.get(id);
  }

  @Post()
  @RequireGlobalAdmin()
  create(@Body() dto: CreateManagementAreaDto) {
    return this.areas.create(dto);
  }

  @Patch(":id")
  @RequireGlobalAdmin()
  update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateManagementAreaDto,
  ) {
    return this.areas.update(id, dto);
  }

  @Delete(":id")
  @RequireGlobalAdmin()
  delete(@Param("id", ParseUUIDPipe) id: string) {
    return this.areas.delete(id);
  }
}

import { Controller, Get, Query } from "@nestjs/common";
import { SearchPaginationQueryDto } from "../common/dto.js";
import { ManagementAreasService } from "./management-areas.service.js";

@Controller("management-areas")
export class ManagementAreasController {
  constructor(private readonly areas: ManagementAreasService) {}

  @Get()
  list(@Query() query: SearchPaginationQueryDto) {
    return this.areas.list(query);
  }
}

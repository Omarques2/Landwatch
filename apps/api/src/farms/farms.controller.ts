import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { ActiveUserGuard } from '../auth/active-user.guard';
import type { AuthedRequest } from '../auth/authed-request.type';
import { CreateFarmDto } from './dto/create-farm.dto';
import { ListFarmsQuery } from './dto/list-farms.query';
import { UpdateFarmDto } from './dto/update-farm.dto';
import { FarmsService } from './farms.service';

@Controller('v1/farms')
@UseGuards(AuthGuard, ActiveUserGuard)
export class FarmsController {
  constructor(private readonly farms: FarmsService) {}

  @Get()
  async list(@Query() query: ListFarmsQuery) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    return this.farms.list({ q: query.q, page, pageSize });
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return this.farms.getById(id);
  }

  @Post()
  async create(@Req() req: AuthedRequest, @Body() dto: CreateFarmDto) {
    if (!req.user) {
      return { status: 'pending' };
    }
    return this.farms.create(req.user, dto);
  }

  @Patch(':id')
  async update(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateFarmDto,
  ) {
    if (!req.user) {
      return { status: 'pending' };
    }
    return this.farms.update(req.user, id, dto);
  }
}

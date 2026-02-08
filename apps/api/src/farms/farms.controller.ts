import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { AuthedRequest } from '../auth/authed-request.type';
import { CreateFarmDto } from './dto/create-farm.dto';
import { ListFarmsQuery } from './dto/list-farms.query';
import { UpdateFarmDto } from './dto/update-farm.dto';
import { FarmsService } from './farms.service';

@Controller('v1/farms')
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
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Missing user claims',
      });
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
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Missing user claims',
      });
    }
    return this.farms.update(req.user, id, dto);
  }
}

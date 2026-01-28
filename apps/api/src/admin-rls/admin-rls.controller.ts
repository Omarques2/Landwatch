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
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { PlatformAdminGuard } from '../auth/platform-admin.guard';
import { AdminRlsService } from './admin-rls.service';
import type { AuthedRequest } from '../auth/authed-request.type';
import {
  CreateRulesDto,
  CreateTargetDto,
  ListRulesQueryDto,
  SnapshotQueryDto,
  UpdateTargetDto,
} from './dto/admin-rls.dto';

@Controller('admin/rls')
@UseGuards(AuthGuard, PlatformAdminGuard)
export class AdminRlsController {
  constructor(private readonly svc: AdminRlsService) {}

  @Get('datasets')
  listDatasets() {
    return this.svc.listDatasets();
  }

  @Get('datasets/:datasetId/targets')
  listTargets(@Param('datasetId', ParseUUIDPipe) datasetId: string) {
    return this.svc.listTargets(datasetId);
  }

  @Post('datasets/:datasetId/targets')
  createTarget(
    @Req() req: AuthedRequest,
    @Param('datasetId', ParseUUIDPipe) datasetId: string,
    @Body() body: CreateTargetDto,
  ) {
    const actorSub = req.user?.sub ? String(req.user.sub) : null;
    return this.svc.createTarget(datasetId, body, actorSub);
  }

  @Patch('targets/:targetId')
  updateTarget(
    @Req() req: AuthedRequest,
    @Param('targetId', ParseUUIDPipe) targetId: string,
    @Body() body: UpdateTargetDto,
  ) {
    const actorSub = req.user?.sub ? String(req.user.sub) : null;
    return this.svc.updateTarget(targetId, body, actorSub);
  }

  @Delete('targets/:targetId')
  deleteTarget(
    @Req() req: AuthedRequest,
    @Param('targetId', ParseUUIDPipe) targetId: string,
  ) {
    const actorSub = req.user?.sub ? String(req.user.sub) : null;
    return this.svc.deleteTarget(targetId, actorSub);
  }

  @Get('targets/:targetId/rules')
  listRules(
    @Param('targetId', ParseUUIDPipe) targetId: string,
    @Query() query: ListRulesQueryDto,
  ) {
    return this.svc.listRules(targetId, query.customerId, query.userId);
  }

  @Post('targets/:targetId/rules')
  createRules(
    @Req() req: AuthedRequest,
    @Param('targetId', ParseUUIDPipe) targetId: string,
    @Body() body: CreateRulesDto,
  ) {
    const actorSub = req.user?.sub ? String(req.user.sub) : null;
    return this.svc.createRules(targetId, body?.items ?? [], actorSub);
  }

  @Delete('rules/:ruleId')
  deleteRule(
    @Req() req: AuthedRequest,
    @Param('ruleId', ParseUUIDPipe) ruleId: string,
  ) {
    const actorSub = req.user?.sub ? String(req.user.sub) : null;
    return this.svc.deleteRule(ruleId, actorSub);
  }

  @Post('datasets/:datasetId/refresh')
  refreshDataset(
    @Req() req: AuthedRequest,
    @Param('datasetId', ParseUUIDPipe) datasetId: string,
  ) {
    const actorSub = req.user?.sub ? String(req.user.sub) : null;
    return this.svc.refreshDataset(datasetId, actorSub);
  }

  @Get('datasets/:datasetId/refreshes')
  listRefreshes(@Param('datasetId', ParseUUIDPipe) datasetId: string) {
    return this.svc.listDatasetRefreshes(datasetId);
  }

  @Get('datasets/:datasetId/snapshot')
  snapshot(
    @Req() req: AuthedRequest,
    @Param('datasetId', ParseUUIDPipe) datasetId: string,
    @Query() query: SnapshotQueryDto,
  ) {
    const actorSub = req.user?.sub ? String(req.user.sub) : null;
    return this.svc.getDatasetSnapshot(datasetId, query.format, actorSub);
  }
}

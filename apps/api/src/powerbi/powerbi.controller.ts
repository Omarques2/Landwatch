import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';

import { PowerBiService } from './powerbi.service';
import { AuthGuard } from '../auth/auth.guard';
import { UsersService } from '../users/users.service';
import { BiAuthzService } from '../bi-authz/bi-authz.service';
import type { AuthedRequest } from '../auth/authed-request.type';
import { ActiveUserGuard } from '../auth/active-user.guard';
import {
  EmbedConfigQueryDto,
  ExportReportDto,
  RefreshReportDto,
  RefreshStatusQueryDto,
  WorkspaceQueryDto,
} from './dto/powerbi.dto';

@Controller('powerbi')
export class PowerBiController {
  constructor(
    private readonly svc: PowerBiService,
    private readonly usersService: UsersService,
    private readonly biAuthz: BiAuthzService,
  ) {}

  @UseGuards(AuthGuard, ActiveUserGuard)
  @Get('workspaces')
  async getWorkspaces(@Req() req: AuthedRequest) {
    if (!req.user) throw new BadRequestException('Missing user claims');
    const user = await this.usersService.upsertFromClaims(req.user);
    return this.biAuthz.listAllowedWorkspaces(user.id);
  }

  @UseGuards(AuthGuard, ActiveUserGuard)
  @Get('reports')
  async getReports(
    @Req() req: AuthedRequest,
    @Query() query: WorkspaceQueryDto,
  ) {
    if (!req.user) throw new BadRequestException('Missing user claims');
    const user = await this.usersService.upsertFromClaims(req.user);
    return this.biAuthz.listAllowedReports(user.id, query.workspaceId);
  }

  @UseGuards(AuthGuard, ActiveUserGuard)
  @Get('pages')
  async getPages(
    @Req() req: AuthedRequest,
    @Query() query: EmbedConfigQueryDto,
  ) {
    if (!req.user) throw new BadRequestException('Missing user claims');
    const user = await this.usersService.upsertFromClaims(req.user);
    const result = await this.biAuthz.listAllowedPages(
      user.id,
      query.workspaceId,
      query.reportId,
    );
    return { pages: result.pages };
  }

  @UseGuards(AuthGuard, ActiveUserGuard)
  @Get('embed-config')
  async getEmbedConfig(
    @Req() req: AuthedRequest,
    @Query() query: EmbedConfigQueryDto,
  ) {
    if (!req.user) throw new BadRequestException('Missing user claims');
    const user = await this.usersService.upsertFromClaims(req.user);
    const access = await this.biAuthz.resolveReportAccess(
      user.id,
      query.workspaceId,
      query.reportId,
    );
    const customerId = access.customerId;
    const username = user.id;
    return this.svc.getEmbedConfig(query.workspaceId, query.reportId, {
      username,
      roles: ['CustomerRLS'],
      customData: customerId,
    });
  }

  @UseGuards(AuthGuard, ActiveUserGuard)
  @Post('export/pdf')
  @HttpCode(200)
  async exportReportPdf(
    @Req() req: AuthedRequest,
    @Body()
    body: ExportReportDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const workspaceId = body?.workspaceId;
    const reportId = body?.reportId;
    const format = (body?.format ?? 'PDF').toUpperCase();

    if (!workspaceId || !reportId) {
      throw new BadRequestException('workspaceId and reportId are required');
    }

    if (format !== 'PDF' && format !== 'PNG') {
      throw new BadRequestException('format must be PDF or PNG');
    }

    if (!req.user) throw new BadRequestException('Missing user claims');
    const user = await this.usersService.upsertFromClaims(req.user);
    const access = await this.biAuthz.resolveReportAccess(
      user.id,
      workspaceId,
      reportId,
    );
    const pages = await this.biAuthz.resolveAllowedPagesForAccess({
      userId: user.id,
      customerId: access.customerId,
      reportRefId: access.reportRefId,
    });
    const customerId = access.customerId;
    const username = user.id;
    const allowedPageNames = pages.pages.map((p) => p.pageName);
    const requestedPage = body?.pageName?.trim() || null;

    if (requestedPage && !allowedPageNames.includes(requestedPage)) {
      throw new ForbiddenException('No access to report page');
    }

    const result = await this.svc.exportReportFile(workspaceId, reportId, {
      username,
      roles: ['CustomerRLS'],
      customData: customerId,
      bookmarkState: body?.bookmarkState,
      format: format,
      pageNames: requestedPage ? [requestedPage] : allowedPageNames,
      skipStamp: body?.skipStamp,
      relaxedPdfCheck: body?.relaxedPdfCheck,
      forceIdentity: body?.forceIdentity,
    });

    const extension = result.kind === 'zip' ? 'zip' : result.kind;
    const contentType =
      result.kind === 'zip'
        ? 'application/zip'
        : result.kind === 'png'
          ? 'image/png'
          : 'application/pdf';
    res.set({
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="report.${extension}"`,
      'Cache-Control': 'no-store',
    });

    return new StreamableFile(result.buffer);
  }

  @UseGuards(AuthGuard, ActiveUserGuard)
  @Post('refresh')
  @HttpCode(200)
  async refreshReport(
    @Req() req: AuthedRequest,
    @Body() body: RefreshReportDto,
  ) {
    const workspaceId = body?.workspaceId;
    const reportId = body?.reportId;

    if (!workspaceId || !reportId) {
      throw new BadRequestException('workspaceId and reportId are required');
    }

    if (!req.user) throw new BadRequestException('Missing user claims');
    const user = await this.usersService.upsertFromClaims(req.user);
    const access = await this.biAuthz.resolveReportAccess(
      user.id,
      workspaceId,
      reportId,
    );

    if (!access.datasetId) {
      throw new BadRequestException('Report sem datasetId');
    }

    const refresh = await this.svc.refreshDatasetInGroup(
      workspaceId,
      access.datasetId,
    );

    return { ok: true, status: 'queued', refresh };
  }

  @UseGuards(AuthGuard, ActiveUserGuard)
  @Get('refresh/status')
  async refreshStatus(
    @Req() req: AuthedRequest,
    @Query() query: RefreshStatusQueryDto,
  ) {
    if (!req.user) throw new BadRequestException('Missing user claims');
    const user = await this.usersService.upsertFromClaims(req.user);
    const access = await this.biAuthz.resolveReportAccess(
      user.id,
      query.workspaceId,
      query.reportId,
    );

    if (!access.datasetId) {
      throw new BadRequestException('Report sem datasetId');
    }

    const refreshes = await this.svc.listDatasetRefreshesInGroup(
      query.workspaceId,
      access.datasetId,
    );
    const latest = refreshes[0] ?? null;

    return { status: latest?.status ?? 'unknown', refreshes };
  }
}

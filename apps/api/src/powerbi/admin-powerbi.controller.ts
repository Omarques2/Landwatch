import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { PlatformAdminGuard } from '../auth/platform-admin.guard';
import { PowerBiService } from './powerbi.service';
import { PowerBiCatalogSyncService } from './powerbi-catalog-sync.service';
import {
  AdminPowerBiCatalogQueryDto,
  AdminPowerBiPreviewQueryDto,
  AdminPowerBiSyncDto,
  WorkspaceQueryDto,
} from './dto/powerbi.dto';
import { PrismaService } from '../prisma/prisma.service';

@Controller('admin/powerbi')
@UseGuards(AuthGuard, PlatformAdminGuard)
export class AdminPowerBiController {
  constructor(
    private readonly pbi: PowerBiService,
    private readonly sync: PowerBiCatalogSyncService,
    private readonly prisma: PrismaService,
  ) {}

  // DEBUG: o que o service principal está “vendo” no Power BI
  @Get('remote/workspaces')
  async remoteWorkspaces() {
    return this.pbi.listWorkspaces();
  }

  @Get('remote/reports')
  async remoteReports(@Query() query: WorkspaceQueryDto) {
    return this.pbi.listReports(query.workspaceId);
  }

  // SYNC: grava catálogo no BD para um customer
  @Post('sync')
  async syncCustomer(@Body() body: AdminPowerBiSyncDto) {
    return this.sync.syncCustomerCatalog({
      customerId: body.customerId,
      workspaceIds: body.workspaceIds,
      deactivateMissing: body.deactivateMissing ?? true,
    });
  }

  @Get('catalog')
  async catalog(@Query() query: AdminPowerBiCatalogQueryDto) {
    return this.sync.getCustomerCatalog(query.customerId);
  }

  @Get('catalog/global')
  async globalCatalog() {
    return this.sync.getGlobalCatalog();
  }

  @Get('reports/:reportRefId/preview')
  async previewReport(
    @Param('reportRefId', ParseUUIDPipe) reportRefId: string,
    @Query() query: AdminPowerBiPreviewQueryDto,
  ) {
    const report = await this.prisma.biReport.findUnique({
      where: { id: reportRefId },
      select: {
        reportId: true,
        workspace: { select: { workspaceId: true } },
      },
    });

    if (!report) throw new NotFoundException('Report not found');

    if (query.userId && !query.customerId) {
      throw new BadRequestException(
        'customerId is required when userId is provided',
      );
    }

    if (query.customerId) {
      const customerExists = await this.prisma.customer.findUnique({
        where: { id: query.customerId },
        select: { id: true },
      });
      if (!customerExists) throw new NotFoundException('Customer not found');
    }

    if (query.userId) {
      const userExists = await this.prisma.user.findUnique({
        where: { id: query.userId },
        select: { id: true },
      });
      if (!userExists) throw new NotFoundException('User not found');

      const membership = await this.prisma.userCustomerMembership.findFirst({
        where: {
          userId: query.userId,
          customerId: query.customerId,
          isActive: true,
        },
        select: { id: true },
      });
      if (!membership) {
        throw new NotFoundException('Active membership not found');
      }
    }

    return this.pbi.getEmbedConfig(
      report.workspace.workspaceId,
      report.reportId,
      query.customerId
        ? {
            username: query.userId
              ? query.userId
              : `preview:${query.customerId}`,
            roles: ['CustomerRLS'],
            customData: query.customerId,
            forceIdentity: query.forceIdentity,
          }
        : undefined,
    );
  }
}

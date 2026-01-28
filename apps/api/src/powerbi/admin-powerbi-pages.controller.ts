import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { PlatformAdminGuard } from '../auth/platform-admin.guard';
import {
  PageGroupCreateDto,
  PageGroupPagesDto,
  PageGroupUpdateDto,
  PageGroupLinkDto,
  PageAllowDto,
} from './dto/powerbi-pages.dto';
import { PowerBiPagesService } from './powerbi-pages.service';

@Controller('admin/powerbi')
@UseGuards(AuthGuard, PlatformAdminGuard)
export class AdminPowerBiPagesController {
  constructor(private readonly pages: PowerBiPagesService) {}

  @Post('reports/:reportRefId/pages/sync')
  syncPages(@Param('reportRefId', ParseUUIDPipe) reportRefId: string) {
    return this.pages.syncReportPages(reportRefId);
  }

  @Get('reports/:reportRefId/pages')
  listPages(@Param('reportRefId', ParseUUIDPipe) reportRefId: string) {
    return this.pages.listReportPages(reportRefId);
  }

  @Get('reports/:reportRefId/page-groups')
  listGroups(@Param('reportRefId', ParseUUIDPipe) reportRefId: string) {
    return this.pages.listPageGroups(reportRefId);
  }

  @Post('reports/:reportRefId/page-groups')
  createGroup(
    @Param('reportRefId', ParseUUIDPipe) reportRefId: string,
    @Body() body: PageGroupCreateDto,
  ) {
    return this.pages.createPageGroup({
      reportRefId,
      name: body.name,
      pageIds: body.pageIds ?? [],
    });
  }

  @Put('page-groups/:groupId')
  updateGroup(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() body: PageGroupUpdateDto,
  ) {
    return this.pages.updatePageGroup(groupId, {
      name: body.name,
      isActive: body.isActive,
    });
  }

  @Put('page-groups/:groupId/pages')
  setGroupPages(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() body: PageGroupPagesDto,
  ) {
    return this.pages.setPageGroupPages(groupId, body.pageIds ?? []);
  }

  @Delete('page-groups/:groupId')
  deleteGroup(@Param('groupId', ParseUUIDPipe) groupId: string) {
    return this.pages.deletePageGroup(groupId);
  }

  @Get('customers/:customerId/reports/:reportRefId/pages')
  getCustomerPageAccess(
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Param('reportRefId', ParseUUIDPipe) reportRefId: string,
  ) {
    return this.pages.getCustomerPageAccess(customerId, reportRefId);
  }

  @Get('users/:userId/reports/:reportRefId/pages')
  getUserPageAccess(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('reportRefId', ParseUUIDPipe) reportRefId: string,
  ) {
    return this.pages.getUserPageAccess(userId, reportRefId);
  }

  @Put('customers/:customerId/page-groups/:groupId')
  setCustomerGroup(
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() body: PageGroupLinkDto,
  ) {
    return this.pages.setCustomerPageGroup(customerId, groupId, body.isActive);
  }

  @Put('users/:userId/page-groups/:groupId')
  setUserGroup(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() body: PageGroupLinkDto,
  ) {
    return this.pages.setUserPageGroup(userId, groupId, body.isActive);
  }

  @Put('customers/:customerId/pages/:pageId')
  setCustomerPage(
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Param('pageId', ParseUUIDPipe) pageId: string,
    @Body() body: PageAllowDto,
  ) {
    return this.pages.setCustomerPageAllow(customerId, pageId, body.canView);
  }

  @Put('users/:userId/pages/:pageId')
  setUserPage(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('pageId', ParseUUIDPipe) pageId: string,
    @Body() body: PageAllowDto,
  ) {
    return this.pages.setUserPageAllow(userId, pageId, body.canView);
  }
}

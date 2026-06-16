import { Controller, Get, Req } from '@nestjs/common';
import { AppFeature, OrgPermission } from '@prisma/client';
import type { AuthedRequest } from './authed-request.type';
import { ActorContextService } from './actor-context.service';
import { PrismaService } from '../prisma/prisma.service';

const TENANT_FEATURES: AppFeature[] = [
  AppFeature.FARMS,
  AppFeature.ANALYSES,
  AppFeature.ANALYSIS_CREATE,
  AppFeature.CAR_SEARCH,
  AppFeature.SCHEDULES,
];

@Controller('v1/access')
export class AccessController {
  constructor(
    private readonly actorContext: ActorContextService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('me')
  async me(@Req() req: AuthedRequest) {
    const actor = await this.actorContext.fromRequest(req, {
      orgMode: 'optional',
    });
    const [activeOrg, orgFeatures, orgPermissions] = await Promise.all([
      actor.orgId
        ? this.prisma.org.findUnique({
            where: { id: actor.orgId },
            select: {
              id: true,
              name: true,
              slug: true,
              status: true,
              kind: true,
            },
          })
        : null,
      actor.orgId && !actor.isPlatformAdmin
        ? this.prisma.orgFeatureAccess.findMany({
            where: { orgId: actor.orgId, enabled: true },
            select: { feature: true },
          })
        : Promise.resolve([] as { feature: AppFeature }[]),
      actor.orgId && !actor.isPlatformAdmin
        ? this.prisma.orgUserPermission.findMany({
            where: { orgId: actor.orgId, userId: actor.userId },
            select: { permission: true },
          })
        : Promise.resolve([] as { permission: OrgPermission }[]),
    ]);

    return {
      activeOrg,
      activeOrgId: actor.orgId,
      orgRole: actor.orgRole,
      isPlatformAdmin: actor.isPlatformAdmin,
      isPlatformOrgAdmin: actor.isPlatformOrgAdmin,
      features: actor.isPlatformAdmin
        ? TENANT_FEATURES
        : orgFeatures.map((row) => row.feature),
      permissions: actor.isPlatformAdmin
        ? [OrgPermission.ATTACHMENT_REVIEW]
        : orgPermissions.map((row) => row.permission),
    };
  }
}

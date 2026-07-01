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

    // Platform admins, and platform users operating inside a PLATFORM org, get
    // the full standard feature set. Tenant context (incl. a platform user
    // operating in a tenant org) respects the per-org feature flags.
    const grantsAllFeatures =
      actor.isPlatformAdmin ||
      (actor.isPlatformUser && activeOrg?.kind === 'PLATFORM');

    return {
      activeOrg,
      activeOrgId: actor.orgId,
      orgRole: actor.orgRole,
      isPlatformAdmin: actor.isPlatformAdmin,
      isPlatformUser: actor.isPlatformUser,
      isPlatformOrgAdmin: actor.isPlatformOrgAdmin,
      features: grantsAllFeatures
        ? TENANT_FEATURES
        : orgFeatures.map((row) => row.feature),
      permissions: actor.isPlatformAdmin
        ? [OrgPermission.ATTACHMENT_REVIEW]
        : orgPermissions.map((row) => row.permission),
    };
  }

  // Orgs available to the current actor for filtering the Farms/Analyses lists.
  // Platform operators (admin or PLATFORM-org member) get every org so they can
  // tell which org a farm/analysis belongs to and narrow the view; a plain
  // tenant can only ever "filter" to its own active org, so we return just that.
  @Get('orgs')
  async orgs(@Req() req: AuthedRequest) {
    const actor = await this.actorContext.fromRequest(req, {
      orgMode: 'optional',
    });
    if (actor.isPlatformAdmin || actor.isPlatformUser) {
      return this.prisma.org.findMany({
        orderBy: { name: 'asc' },
        select: { id: true, name: true, kind: true, slug: true },
      });
    }
    if (!actor.orgId) return [];
    const org = await this.prisma.org.findUnique({
      where: { id: actor.orgId },
      select: { id: true, name: true, kind: true, slug: true },
    });
    return org ? [org] : [];
  }
}

import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AppFeature } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { ActorContext } from './actor-context.service';

@Injectable()
export class AccessService {
  constructor(private readonly prisma: PrismaService) {}

  async requirePlatformAdmin(actor: ActorContext) {
    if (actor.isPlatformAdmin) return;
    throw new ForbiddenException({
      code: 'PLATFORM_ADMIN_REQUIRED',
      message: 'Platform admin required',
    });
  }

  async requireTenantFeature(actor: ActorContext, feature: AppFeature) {
    if (actor.isPlatformAdmin) return;
    if (!actor.orgId) {
      throw new ForbiddenException({
        code: 'ORG_REQUIRED',
        message: 'Organization context required',
      });
    }
    const access = await this.prisma.orgFeatureAccess.findUnique({
      where: { orgId_feature: { orgId: actor.orgId, feature } },
      select: { enabled: true },
    });
    if (!access?.enabled) {
      throw new ForbiddenException({
        code: 'FEATURE_FORBIDDEN',
        message: 'Feature not enabled for organization',
        details: { feature },
      });
    }
  }

  requireSameOrgOrPlatform(actor: ActorContext, resourceOrgId: string | null) {
    if (actor.isPlatformAdmin) return;
    if (!actor.orgId || resourceOrgId !== actor.orgId) {
      throw new ForbiddenException({
        code: 'RESOURCE_ORG_FORBIDDEN',
        message: 'Resource belongs to another organization',
      });
    }
  }

  async assertCanReadAnalysis(actor: ActorContext, analysisId: string) {
    const analysis = await this.prisma.analysis.findUnique({
      where: { id: analysisId },
      select: { id: true, orgId: true },
    });
    if (!analysis) {
      throw new NotFoundException({
        code: 'ANALYSIS_NOT_FOUND',
        message: 'Analysis not found',
      });
    }
    this.requireSameOrgOrPlatform(actor, analysis.orgId);
    return analysis;
  }

  async assertCanReadFarm(actor: ActorContext, farmId: string) {
    const farm = await this.prisma.farm.findUnique({
      where: { id: farmId },
      select: { id: true, orgId: true },
    });
    if (!farm) {
      throw new NotFoundException({
        code: 'FARM_NOT_FOUND',
        message: 'Farm not found',
      });
    }
    if (farm.orgId === null) return farm;
    this.requireSameOrgOrPlatform(actor, farm.orgId);
    return farm;
  }

  async assertCanEditFarm(actor: ActorContext, farmId: string) {
    const farm = await this.assertCanReadFarm(actor, farmId);
    if (actor.isPlatformAdmin) return farm;
    if (!farm.orgId || farm.orgId !== actor.orgId) {
      throw new ForbiddenException({
        code: 'FARM_EDIT_FORBIDDEN',
        message: 'Farm cannot be edited by this actor',
      });
    }
    return farm;
  }

  async farmScopedLookup(
    actor: ActorContext,
    carKey: string,
    options?: { select?: Record<string, unknown>; include?: Record<string, unknown> },
  ) {
    if (!actor.isPlatformAdmin && actor.orgId) {
      const orgFarm = await this.prisma.farm.findFirst({
        where: { orgId: actor.orgId, carKey },
        ...(options ?? {}),
      } as any);
      if (orgFarm) return orgFarm;
    }
    return this.prisma.farm.findFirst({
      where: { orgId: null, carKey },
      ...(options ?? {}),
    } as any);
  }
}

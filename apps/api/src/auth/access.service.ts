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

  // Narrow param: any actor-like object that exposes `isPlatformAdmin`
  // satisfies this (auth ActorContext and the attachments-local actor alike),
  // so callers no longer need an `as any` cast. Synchronous: it only checks a
  // boolean and throws.
  requirePlatformAdmin(actor: Pick<ActorContext, 'isPlatformAdmin'>): void {
    if (actor.isPlatformAdmin) return;
    throw new ForbiddenException({
      code: 'PLATFORM_ADMIN_REQUIRED',
      message: 'Platform admin required',
    });
  }

  // Platform USER tier: any active member of the PLATFORM org (incl. plain
  // `member`) or a platform admin. Gates operational platform tools (dashboard,
  // anexos, fornecedores) — NOT /admin or structural management.
  requirePlatformUser(
    actor: Pick<ActorContext, 'isPlatformAdmin' | 'isPlatformUser'>,
  ): void {
    if (actor.isPlatformAdmin || actor.isPlatformUser) return;
    throw new ForbiddenException({
      code: 'PLATFORM_USER_REQUIRED',
      message: 'Platform access required',
    });
  }

  // Global operational READ access (data of all orgs). Platform admins and
  // platform users (PLATFORM-org members = global operators) qualify. This is a
  // READ grant ONLY — it must never be used to authorize writes or structural
  // management (those stay org-scoped / admin-only).
  canReadAllOperationalData(
    actor: Pick<ActorContext, 'isPlatformAdmin' | 'isPlatformUser'>,
  ): boolean {
    return actor.isPlatformAdmin || actor.isPlatformUser;
  }

  async requireTenantFeature(actor: ActorContext, feature: AppFeature) {
    // Platform admins always pass. Platform users get the standard operational
    // features WITHOUT per-org flags only while operating inside a PLATFORM org
    // (never blanket-granted in a tenant org they also belong to).
    if (actor.isPlatformAdmin) return;
    if (actor.isPlatformUser && actor.orgKind === 'PLATFORM') return;
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

  // Narrow param: only `isPlatformAdmin`/`orgId` are read, so both the auth
  // ActorContext and the attachments-local actor satisfy it (no `as any`).
  requireSameOrgOrPlatform(
    actor: Pick<ActorContext, 'isPlatformAdmin' | 'orgId'>,
    resourceOrgId: string | null,
  ) {
    if (actor.isPlatformAdmin) return;
    if (!actor.orgId || resourceOrgId !== actor.orgId) {
      throw new ForbiddenException({
        code: 'RESOURCE_ORG_FORBIDDEN',
        message: 'Resource belongs to another organization',
      });
    }
  }

  async assertCanReadAnalysis(
    actor: Pick<ActorContext, 'isPlatformAdmin' | 'isPlatformUser' | 'orgId'>,
    analysisId: string,
  ) {
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
    // Global operators (platform admin/user) read any org's analysis; tenants
    // are restricted to their own org.
    if (this.canReadAllOperationalData(actor)) return analysis;
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
    // Global operators read any org's farm; tenants only their own org.
    if (this.canReadAllOperationalData(actor)) return farm;
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
    options?: {
      select?: Record<string, unknown>;
      include?: Record<string, unknown>;
    },
  ) {
    // Global operators (platform admin/user) resolve a CAR across all orgs.
    if (this.canReadAllOperationalData(actor)) {
      return this.prisma.farm.findFirst({
        where: { carKey },
        ...(options ?? {}),
      } as any);
    }
    if (actor.orgId) {
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

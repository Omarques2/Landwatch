import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AppFeature,
  OrgKind,
  OrgRole,
  OrgStatus,
  Prisma,
  UserStatus,
} from '@prisma/client';
import { AccessService } from '../auth/access.service';
import { ActorContextService } from '../auth/actor-context.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrgDto } from './dto/create-org.dto';
import { ManageMembershipDto } from './dto/manage-membership.dto';
import { UpdateOrgDto } from './dto/update-org.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import {
  TENANT_ADMIN_FEATURES,
  UpdateOrgFeaturesDto,
} from './dto/update-org-features.dto';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly actorContext: ActorContextService,
    private readonly access: AccessService,
  ) {}

  async assertAdmin(subject: string) {
    // Single source of truth for the platform-admin definition: env allowlist,
    // dev bypass, or owner/admin of an active PLATFORM org (see ActorContext).
    const actor = await this.actorContext.fromSubject(subject, {
      orgMode: 'platform',
    });
    this.access.requirePlatformAdmin(actor);
  }

  async getCapabilities(subject: string) {
    try {
      await this.assertAdmin(subject);
      return { canAccessAdmin: true };
    } catch {
      return { canAccessAdmin: false };
    }
  }

  private slugify(input: string) {
    const normalized = input
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return normalized || 'org';
  }

  private serializeMembership(row: any) {
    return {
      id: row.id,
      orgId: row.orgId,
      userId: row.userId,
      role: row.role,
      createdAt:
        row.createdAt instanceof Date
          ? row.createdAt.toISOString()
          : String(row.createdAt),
      user: row.user
        ? {
            id: row.user.id,
            email: row.user.email ?? null,
            displayName: row.user.displayName ?? null,
            status: row.user.status,
          }
        : null,
      org: row.org
        ? {
            id: row.org.id,
            name: row.org.name,
            slug: row.org.slug,
            kind: row.org.kind,
          }
        : null,
    };
  }

  private serializeUser(row: any) {
    return {
      id: row.id,
      identityUserId: row.identityUserId ?? null,
      email: row.email ?? null,
      displayName: row.displayName ?? null,
      status: row.status,
      createdAt:
        row.createdAt instanceof Date
          ? row.createdAt.toISOString()
          : String(row.createdAt),
      lastLoginAt:
        row.lastLoginAt instanceof Date
          ? row.lastLoginAt.toISOString()
          : (row.lastLoginAt ?? null),
      memberships: Array.isArray(row.memberships)
        ? row.memberships.map((membership: any) => ({
            orgId: membership.orgId,
            role: membership.role,
            org: membership.org
              ? {
                  id: membership.org.id,
                  name: membership.org.name,
                  slug: membership.org.slug,
                  kind: membership.org.kind,
                }
              : null,
          }))
        : [],
    };
  }

  async listOrgs(subject: string) {
    await this.assertAdmin(subject);
    return this.prisma.org.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: {
            memberships: true,
            orgUserPermissions: true,
            featureAccess: true,
          },
        },
      },
    });
  }

  async createOrg(subject: string, dto: CreateOrgDto) {
    await this.assertAdmin(subject);
    const name = dto.name?.trim();
    if (!name) {
      throw new BadRequestException({
        code: 'ORG_NAME_REQUIRED',
        message: 'Organization name is required',
      });
    }
    const slug = this.slugify(dto.slug?.trim() || name);
    const kind = dto.kind ?? OrgKind.TENANT;
    return this.prisma.org.create({
      data: { name, slug, kind },
    });
  }

  async updateOrg(subject: string, orgId: string, dto: UpdateOrgDto) {
    await this.assertAdmin(subject);
    const data: Prisma.OrgUpdateInput = {};
    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (!name) {
        throw new BadRequestException({
          code: 'ORG_NAME_REQUIRED',
          message: 'Organization name is required',
        });
      }
      data.name = name;
    }
    if (dto.status !== undefined) {
      data.status = dto.status as OrgStatus;
    }
    if (dto.kind !== undefined) {
      data.kind = dto.kind;
    }
    return this.prisma.org.update({ where: { id: orgId }, data });
  }

  async listOrgFeatures(subject: string, orgId: string) {
    await this.assertAdmin(subject);
    const rows = await this.prisma.orgFeatureAccess.findMany({
      where: { orgId, feature: { in: [...TENANT_ADMIN_FEATURES] } },
      select: { feature: true, enabled: true },
    });
    const byFeature = new Map(rows.map((row) => [row.feature, row.enabled]));
    return TENANT_ADMIN_FEATURES.map((feature) => ({
      feature,
      enabled: byFeature.get(feature) ?? false,
    }));
  }

  async updateOrgFeatures(
    subject: string,
    orgId: string,
    dto: UpdateOrgFeaturesDto,
  ) {
    await this.assertAdmin(subject);
    const org = await this.prisma.org.findUnique({
      where: { id: orgId },
      select: { id: true, kind: true },
    });
    if (!org) {
      throw new NotFoundException({
        code: 'ORG_NOT_FOUND',
        message: 'Organization not found',
      });
    }
    if (org.kind !== OrgKind.TENANT) {
      throw new BadRequestException({
        code: 'ORG_FEATURES_TENANT_ONLY',
        message:
          'Feature access can only be configured for tenant organizations',
      });
    }
    const allowed = new Set<AppFeature>(TENANT_ADMIN_FEATURES);
    for (const item of dto.features ?? []) {
      if (!allowed.has(item.feature)) {
        throw new BadRequestException({
          code: 'ORG_FEATURE_NOT_ALLOWED',
          message: 'Feature cannot be configured for tenant organizations',
        });
      }
    }
    await this.prisma.$transaction(async (tx) => {
      for (const item of dto.features) {
        await tx.orgFeatureAccess.upsert({
          where: {
            orgId_feature: { orgId, feature: item.feature },
          },
          create: {
            orgId,
            feature: item.feature,
            enabled: Boolean(item.enabled),
          },
          update: { enabled: Boolean(item.enabled) },
        });
      }
      await tx.orgFeatureAccess.updateMany({
        where: {
          orgId,
          feature: { notIn: [...TENANT_ADMIN_FEATURES] },
        },
        data: { enabled: false },
      });
    });
    return this.listOrgFeatures(subject, orgId);
  }

  async listUsers(subject: string, q?: string) {
    await this.assertAdmin(subject);
    const query = q?.trim();
    const rows = await this.prisma.user.findMany({
      where: query
        ? {
            OR: [
              { email: { contains: query, mode: 'insensitive' } },
              { displayName: { contains: query, mode: 'insensitive' } },
            ],
          }
        : undefined,
      select: {
        id: true,
        identityUserId: true,
        email: true,
        displayName: true,
        status: true,
        createdAt: true,
        lastLoginAt: true,
        memberships: {
          select: {
            orgId: true,
            role: true,
            org: {
              select: {
                id: true,
                name: true,
                slug: true,
                kind: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return rows.map((row) => this.serializeUser(row));
  }

  async listMemberships(subject: string, orgId: string) {
    await this.assertAdmin(subject);
    const rows = await this.prisma.orgMembership.findMany({
      where: { orgId },
      include: {
        user: {
          select: { id: true, email: true, displayName: true, status: true },
        },
        org: { select: { id: true, name: true, slug: true, kind: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => this.serializeMembership(row));
  }

  async addMembership(
    subject: string,
    orgId: string,
    dto: ManageMembershipDto,
  ) {
    await this.assertAdmin(subject);
    const row = await this.prisma.orgMembership.upsert({
      where: { orgId_userId: { orgId, userId: dto.userId } },
      create: { orgId, userId: dto.userId, role: dto.role as OrgRole },
      update: { role: dto.role as OrgRole },
      include: {
        user: {
          select: { id: true, email: true, displayName: true, status: true },
        },
        org: { select: { id: true, name: true, slug: true, kind: true } },
      },
    });
    return this.serializeMembership(row);
  }

  async updateMembership(
    subject: string,
    orgId: string,
    userId: string,
    dto: ManageMembershipDto,
  ) {
    await this.assertAdmin(subject);
    const row = await this.prisma.orgMembership.update({
      where: { orgId_userId: { orgId, userId } },
      data: { role: dto.role as OrgRole },
      include: {
        user: {
          select: { id: true, email: true, displayName: true, status: true },
        },
        org: { select: { id: true, name: true, slug: true, kind: true } },
      },
    });
    return this.serializeMembership(row);
  }

  async removeMembership(subject: string, orgId: string, userId: string) {
    await this.assertAdmin(subject);
    const result = await this.prisma.orgMembership.deleteMany({
      where: { orgId, userId },
    });
    return { removed: result.count };
  }

  async updateUserStatus(
    subject: string,
    userId: string,
    dto: UpdateUserStatusDto,
  ) {
    await this.assertAdmin(subject);
    if (dto.status === UserStatus.active && (!dto.orgId || !dto.role)) {
      throw new BadRequestException({
        code: 'USER_ACTIVATION_REQUIRES_ORG',
        message: 'orgId and role are required to activate a user',
      });
    }

    const row = await this.prisma.$transaction(async (tx) => {
      if (dto.status === UserStatus.active && dto.orgId && dto.role) {
        await tx.orgMembership.upsert({
          where: { orgId_userId: { orgId: dto.orgId, userId } },
          create: { orgId: dto.orgId, userId, role: dto.role as OrgRole },
          update: { role: dto.role as OrgRole },
        });
      }

      return tx.user.update({
        where: { id: userId },
        data: { status: dto.status as UserStatus },
        select: {
          id: true,
          identityUserId: true,
          email: true,
          displayName: true,
          status: true,
          createdAt: true,
          lastLoginAt: true,
          memberships: {
            select: {
              orgId: true,
              role: true,
              org: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                  kind: true,
                },
              },
            },
            orderBy: { createdAt: 'asc' },
          },
        },
      });
    });

    return this.serializeUser(row);
  }
}

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { OrgRole, OrgStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrgDto } from './dto/create-org.dto';
import { ManageMembershipDto } from './dto/manage-membership.dto';
import { UpdateOrgDto } from './dto/update-org.dto';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  private platformAdminSubjects() {
    return new Set(
      (process.env.PLATFORM_ADMIN_SUBS ?? '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
    );
  }

  private isDevBypassAdmin(subject: string) {
    const nodeEnv = process.env.NODE_ENV ?? 'development';
    if (nodeEnv === 'production' || nodeEnv === 'staging') return false;
    if ((process.env.AUTH_BYPASS_LOCALHOST ?? '').trim().toLowerCase() !== 'true') {
      return false;
    }
    const configured = process.env.VITE_DEV_USER_SUB?.trim();
    return subject === (configured || '00000000-0000-4000-8000-000000000001');
  }

  async assertAdmin(subject: string) {
    if (this.platformAdminSubjects().has(subject) || this.isDevBypassAdmin(subject)) {
      return;
    }
    throw new ForbiddenException({
      code: 'ADMIN_ONLY',
      message: 'Only platform admins can manage organizations',
    });
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
          }
        : null,
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
    return this.prisma.org.create({
      data: { name, slug },
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
    return this.prisma.org.update({ where: { id: orgId }, data });
  }

  async listUsers(subject: string, q?: string) {
    await this.assertAdmin(subject);
    const query = q?.trim();
    return this.prisma.user.findMany({
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
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async listMemberships(subject: string, orgId: string) {
    await this.assertAdmin(subject);
    const rows = await this.prisma.orgMembership.findMany({
      where: { orgId },
      include: {
        user: {
          select: { id: true, email: true, displayName: true, status: true },
        },
        org: { select: { id: true, name: true, slug: true } },
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
        org: { select: { id: true, name: true, slug: true } },
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
        org: { select: { id: true, name: true, slug: true } },
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
}

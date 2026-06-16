import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { ApiClientKind, OrgRole } from '@prisma/client';
import { OrgStatus, UserStatus } from '@prisma/client';
import type { AuthedRequest, ApiKeyPrincipal } from './authed-request.type';
import { PrismaService } from '../prisma/prisma.service';

export type ActorSource = 'user' | 'apiKey';
export type OrgMode = 'tenant' | 'platform' | 'optional';

export type ActorContext = {
  userId: string;
  subject: string;
  orgId: string | null;
  orgRole: OrgRole | null;
  isPlatformAdmin: boolean;
  isPlatformOrgAdmin: boolean;
  source: ActorSource;
  apiKeyId?: string;
  apiClientId?: string;
  apiClientKind?: ApiClientKind;
};

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class ActorContextService {
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

  private normalizeHeader(value: string | string[] | undefined): string | null {
    const raw = Array.isArray(value) ? value[0] : value;
    const normalized = raw?.trim();
    if (!normalized) return null;
    if (!UUID_REGEX.test(normalized)) {
      throw new BadRequestException({
        code: 'ORG_INVALID',
        message: 'X-Org-Id is invalid',
      });
    }
    return normalized;
  }

  private async resolveUser(subject: string) {
    const user = await this.prisma.user.findFirst({
      where: { OR: [{ identityUserId: subject }, { entraSub: subject }] },
      select: { id: true, status: true },
    });
    if (!user) {
      throw new ForbiddenException({
        code: 'USER_NOT_FOUND',
        message: 'User not found',
      });
    }
    if (user.status !== UserStatus.active) {
      throw new ForbiddenException({
        code: 'USER_NOT_ACTIVE',
        message: 'User not active',
      });
    }
    return user;
  }

  private async platformMembership(userId: string) {
    return this.prisma.orgMembership.findFirst({
      where: {
        userId,
        role: { in: ['owner', 'admin'] },
        org: { kind: 'PLATFORM', status: OrgStatus.active },
      },
      select: {
        role: true,
        org: { select: { id: true, kind: true, status: true } },
      },
    });
  }

  async fromRequest(
    req: AuthedRequest,
    options: { orgMode: OrgMode },
  ): Promise<ActorContext> {
    const subject = req.user?.sub ? String(req.user.sub) : null;
    if (!subject) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Missing user claims',
      });
    }
    return this.fromSubject(subject, {
      ...options,
      orgId: this.normalizeHeader(req.headers['x-org-id']),
    });
  }

  async fromSubject(
    subject: string,
    options: { orgMode: OrgMode; orgId?: string | null },
  ): Promise<ActorContext> {
    const user = await this.resolveUser(subject);
    const platformByEnv =
      this.platformAdminSubjects().has(subject) || this.isDevBypassAdmin(subject);
    const platformMembership = await this.platformMembership(user.id);
    const isPlatformOrgAdmin = Boolean(platformMembership);
    const isPlatformAdmin = platformByEnv || isPlatformOrgAdmin;
    const requestedOrg = options.orgId ?? null;

    if (options.orgMode === 'platform') {
      return {
        userId: user.id,
        subject,
        orgId: null,
        orgRole: null,
        isPlatformAdmin,
        isPlatformOrgAdmin,
        source: 'user',
      };
    }

    if (!requestedOrg) {
      if (options.orgMode === 'optional' || isPlatformAdmin) {
        return {
          userId: user.id,
          subject,
          orgId: null,
          orgRole: null,
          isPlatformAdmin,
          isPlatformOrgAdmin,
          source: 'user',
        };
      }
      throw new ForbiddenException({
        code: 'ORG_REQUIRED',
        message: 'X-Org-Id is required',
      });
    }

    const org = await this.prisma.org.findUnique({
      where: { id: requestedOrg },
      select: { id: true, status: true, kind: true },
    });
    if (!org) {
      throw new ForbiddenException({
        code: 'ORG_NOT_FOUND',
        message: 'Organization not found',
      });
    }
    if (org.status !== OrgStatus.active) {
      throw new ForbiddenException({
        code: 'ORG_DISABLED',
        message: 'Organization disabled',
      });
    }

    const membership = await this.prisma.orgMembership.findUnique({
      where: { orgId_userId: { orgId: requestedOrg, userId: user.id } },
      select: { role: true },
    });
    if (!membership && !isPlatformAdmin) {
      throw new ForbiddenException({
        code: 'ORG_ACCESS_DENIED',
        message: 'User is not a member of this organization',
      });
    }

    return {
      userId: user.id,
      subject,
      orgId: requestedOrg,
      orgRole: membership?.role ?? null,
      isPlatformAdmin,
      isPlatformOrgAdmin,
      source: 'user',
    };
  }

  async fromApiKey(apiKey: ApiKeyPrincipal): Promise<ActorContext> {
    if (apiKey.kind === 'TENANT' && !apiKey.orgId) {
      throw new ForbiddenException({
        code: 'API_CLIENT_ORG_REQUIRED',
        message: 'Tenant API client requires organization',
      });
    }
    if (apiKey.kind === 'PLATFORM' && apiKey.orgId) {
      throw new ForbiddenException({
        code: 'API_CLIENT_PLATFORM_ORG_FORBIDDEN',
        message: 'Platform API client must not have organization',
      });
    }
    const subject = `m2m:${apiKey.clientId}`;
    const user = await this.prisma.user.upsert({
      where: { entraSub: subject },
      create: {
        entraSub: subject,
        displayName: `M2M ${apiKey.clientId}`,
        status: UserStatus.active,
      },
      update: {},
      select: { id: true, status: true },
    });
    if (user.status !== UserStatus.active) {
      throw new ForbiddenException({
        code: 'USER_NOT_ACTIVE',
        message: 'User not active',
      });
    }
    return {
      userId: user.id,
      subject,
      orgId: apiKey.orgId,
      orgRole: null,
      isPlatformAdmin: apiKey.kind === 'PLATFORM',
      isPlatformOrgAdmin: false,
      source: 'apiKey',
      apiKeyId: apiKey.id,
      apiClientId: apiKey.clientId,
      apiClientKind: apiKey.kind,
    };
  }
}

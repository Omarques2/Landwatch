import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { ApiClientKind, OrgRole } from '@prisma/client';
import { OrgKind, OrgStatus, UserStatus } from '@prisma/client';
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
  // Per-request actor memoization. Keyed by the request object so entries are
  // garbage-collected once the request is done (no manual cleanup / no leak).
  private readonly actorCacheByRequest = new WeakMap<
    object,
    Map<string, ActorContext>
  >();

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
    if (
      (process.env.AUTH_BYPASS_LOCALHOST ?? '').trim().toLowerCase() !== 'true'
    ) {
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

  private userLookupWhere(subject: string) {
    // `User.identityUserId` is a `@db.Uuid` column; querying it with a
    // non-UUID subject (e.g. an ops allowlist entry) throws at the DB level.
    return UUID_REGEX.test(subject)
      ? { OR: [{ identityUserId: subject }, { entraSub: subject }] }
      : { entraSub: subject };
  }

  private async resolveUser(subject: string) {
    const user = await this.prisma.user.findFirst({
      where: this.userLookupWhere(subject),
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

  /**
   * Platform admins configured via env (`PLATFORM_ADMIN_SUBS`) or the local
   * dev bypass are trusted by environment configuration. They may not yet have
   * a `user` row (no prior login), so provision one on demand instead of
   * locking them out. Mirrors the M2M provisioning in `fromApiKey`.
   */
  private async resolveOrProvisionPlatformUser(subject: string) {
    const existing = await this.prisma.user.findFirst({
      where: this.userLookupWhere(subject),
      select: { id: true, status: true },
    });
    if (existing) {
      // An explicitly disabled admin stays disabled — do not silently revive.
      if (existing.status !== UserStatus.active) {
        throw new ForbiddenException({
          code: 'USER_NOT_ACTIVE',
          message: 'User not active',
        });
      }
      return existing;
    }
    const isUuidSubject = UUID_REGEX.test(subject);
    return this.prisma.user.upsert({
      where: { entraSub: subject },
      create: {
        entraSub: subject,
        identityUserId: isUuidSubject ? subject : undefined,
        displayName: `Platform admin ${subject}`,
        status: UserStatus.active,
      },
      update: {},
      select: { id: true, status: true },
    });
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
    const orgId = this.normalizeHeader(req.headers['x-org-id']);
    // Per-request memoization (keyed by the request object via WeakMap, so it
    // is GC'd with the request): if a guard/controller already resolved this
    // actor for the same (orgMode, orgId) in this request, reuse it.
    const cacheKey = `${options.orgMode}:${orgId ?? ''}`;
    let cache = this.actorCacheByRequest.get(req);
    if (!cache) {
      cache = new Map<string, ActorContext>();
      this.actorCacheByRequest.set(req, cache);
    }
    const cached = cache.get(cacheKey);
    if (cached) return cached;
    const actor = await this.fromSubject(subject, { ...options, orgId });
    cache.set(cacheKey, actor);
    return actor;
  }

  async fromSubject(
    subject: string,
    options: { orgMode: OrgMode; orgId?: string | null },
  ): Promise<ActorContext> {
    const platformByEnv =
      this.platformAdminSubjects().has(subject) ||
      this.isDevBypassAdmin(subject);
    const user = platformByEnv
      ? await this.resolveOrProvisionPlatformUser(subject)
      : await this.resolveUser(subject);
    const requestedOrg = options.orgId ?? null;

    // Org-scoped path: the platform-membership, org and tenant-membership
    // lookups are independent given (user.id, requestedOrg), so run them in a
    // single parallel batch instead of 3 serial round-trips. The check ORDER
    // below is preserved exactly (not-found → disabled → platform-context →
    // membership), so behavior is unchanged.
    if (options.orgMode !== 'platform' && requestedOrg) {
      const [platformMembership, org, membership] = await Promise.all([
        this.platformMembership(user.id),
        this.prisma.org.findUnique({
          where: { id: requestedOrg },
          select: { id: true, status: true, kind: true },
        }),
        this.prisma.orgMembership.findUnique({
          where: { orgId_userId: { orgId: requestedOrg, userId: user.id } },
          select: { role: true },
        }),
      ]);
      const isPlatformOrgAdmin = Boolean(platformMembership);
      const isPlatformAdmin = platformByEnv || isPlatformOrgAdmin;

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
      // A non-admin member of the PLATFORM org must never get tenant-scoped
      // access to legacy data backfilled into the platform org.
      if (org.kind === OrgKind.PLATFORM && !isPlatformAdmin) {
        throw new ForbiddenException({
          code: 'ORG_ACCESS_DENIED',
          message: 'User cannot use platform organization as tenant context',
        });
      }
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

    // Platform mode or no requested org: only platform-membership is needed.
    const platformMembership = await this.platformMembership(user.id);
    const isPlatformOrgAdmin = Boolean(platformMembership);
    const isPlatformAdmin = platformByEnv || isPlatformOrgAdmin;

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

  /**
   * Central platform-admin check reused by modules that only need the boolean
   * (e.g. attachments). Honors env allowlist, dev bypass and PLATFORM org
   * membership through the single `fromSubject` rule.
   */
  async isPlatformAdminSubject(subject: string): Promise<boolean> {
    const actor = await this.fromSubject(subject, { orgMode: 'platform' });
    return actor.isPlatformAdmin;
  }

  async fromApiKey(
    apiKey: ApiKeyPrincipal,
    options: { orgId?: string | null } = {},
  ): Promise<ActorContext> {
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

    const requestedOrg = options.orgId ?? null;
    // A TENANT key is pinned to its own org; it may not target another.
    if (
      apiKey.kind === 'TENANT' &&
      requestedOrg &&
      requestedOrg !== apiKey.orgId
    ) {
      throw new ForbiddenException({
        code: 'API_CLIENT_ORG_FORBIDDEN',
        message: 'Tenant API client cannot target another organization',
      });
    }
    // A PLATFORM key carries no org of its own; the target org (if any) comes
    // from the request and must be an active TENANT org.
    const effectiveOrgId =
      apiKey.kind === 'PLATFORM' ? requestedOrg : apiKey.orgId;
    if (apiKey.kind === 'PLATFORM' && requestedOrg) {
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
      if (org.kind !== OrgKind.TENANT) {
        throw new ForbiddenException({
          code: 'ORG_TARGET_INVALID',
          message: 'Platform API client must target a tenant organization',
        });
      }
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
      orgId: effectiveOrgId,
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

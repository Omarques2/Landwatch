import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHmac } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { API_KEY_SCOPES_KEY } from './api-key-scopes.decorator';
import type { AuthedRequest } from './authed-request.type';
import { ApiClientKind, type ApiKeyScope } from '@prisma/client';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const apiKey = req.get('x-api-key');
    if (!apiKey) {
      throw new UnauthorizedException('Missing API key');
    }

    const pepper = process.env.API_KEY_PEPPER;
    if (!pepper) {
      throw new ForbiddenException({
        code: 'API_KEY_NOT_CONFIGURED',
        message: 'API key pepper not configured',
      });
    }

    const keyHash = createHmac('sha256', pepper).update(apiKey).digest('hex');

    const record = await this.prisma.apiKey.findUnique({
      where: { keyHash },
      select: {
        id: true,
        scopes: true,
        expiresAt: true,
        revokedAt: true,
        client: {
          select: {
            id: true,
            orgId: true,
            kind: true,
            status: true,
            org: { select: { id: true, status: true } },
          },
        },
      },
    });

    if (!record || record.client.status !== 'active') {
      throw new ForbiddenException({
        code: 'API_KEY_INVALID',
        message: 'API key invalid',
      });
    }

    if (record.client.kind === ApiClientKind.TENANT) {
      if (!record.client.orgId || !record.client.org) {
        throw new ForbiddenException({
          code: 'API_CLIENT_ORG_REQUIRED',
          message: 'Tenant API client requires organization',
        });
      }
      if (record.client.org.status !== 'active') {
        throw new ForbiddenException({
          code: 'API_CLIENT_ORG_DISABLED',
          message: 'Tenant API client organization disabled',
        });
      }
    }

    if (record.client.kind === ApiClientKind.PLATFORM && record.client.orgId) {
      throw new ForbiddenException({
        code: 'API_CLIENT_PLATFORM_ORG_FORBIDDEN',
        message: 'Platform API client must not have organization',
      });
    }

    if (record.revokedAt) {
      throw new ForbiddenException({
        code: 'API_KEY_REVOKED',
        message: 'API key revoked',
      });
    }

    if (record.expiresAt && record.expiresAt.getTime() < Date.now()) {
      throw new ForbiddenException({
        code: 'API_KEY_EXPIRED',
        message: 'API key expired',
      });
    }

    const requiredScopes =
      this.reflector.getAllAndOverride<ApiKeyScope[]>(API_KEY_SCOPES_KEY, [
        ctx.getHandler(),
        ctx.getClass(),
      ]) ?? [];

    if (requiredScopes.length) {
      const hasAll = requiredScopes.every((scope) =>
        record.scopes.includes(scope),
      );
      if (!hasAll) {
        throw new ForbiddenException({
          code: 'API_KEY_SCOPE',
          message: 'API key missing required scope',
          details: { required: requiredScopes },
        });
      }
    }

    await this.prisma.apiKey.update({
      where: { id: record.id },
      data: { lastUsedAt: new Date() },
    });

    req.apiKey = {
      id: record.id,
      clientId: record.client.id,
      orgId: record.client.orgId ?? null,
      kind: record.client.kind,
      scopes: record.scopes,
    };

    return true;
  }
}

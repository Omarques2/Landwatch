import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ApiClientStatus, ApiKeyScope } from '@prisma/client';
import { createHmac, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_API_KEY_SCOPES } from './dto/create-api-key.dto';

type CreateApiKeyInput = {
  clientName: string;
  orgId?: string;
  scopes?: ApiKeyScope[];
  expiresAt?: string;
};

@Injectable()
export class AdminApiKeysService {
  constructor(private readonly prisma: PrismaService) {}

  private getPepper(): string {
    const pepper = process.env.API_KEY_PEPPER;
    if (!pepper) {
      throw new ForbiddenException({
        code: 'API_KEY_NOT_CONFIGURED',
        message: 'API key pepper not configured',
      });
    }
    return pepper;
  }

  private getPrefixLength(): number {
    const raw = process.env.API_KEY_PREFIX_LENGTH;
    const parsed = raw ? Number(raw) : 8;
    return Number.isFinite(parsed) ? Math.max(4, Math.min(32, parsed)) : 8;
  }

  private generateKey(): string {
    const random = randomBytes(32).toString('base64url');
    return `lwk_${random}`;
  }

  private hashKey(key: string, pepper: string): string {
    return createHmac('sha256', pepper).update(key).digest('hex');
  }

  async create(input: CreateApiKeyInput) {
    const pepper = this.getPepper();
    const prefixLength = this.getPrefixLength();

    if (input.orgId) {
      const org = await this.prisma.org.findUnique({
        where: { id: input.orgId },
        select: { id: true },
      });
      if (!org) {
        throw new NotFoundException({
          code: 'ORG_NOT_FOUND',
          message: 'Organization not found',
        });
      }
    }

    const rawKey = this.generateKey();
    const keyHash = this.hashKey(rawKey, pepper);
    const keyPrefix = rawKey.slice(0, prefixLength);
    const scopes = input.scopes?.length ? input.scopes : DEFAULT_API_KEY_SCOPES;

    const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;

    const result = await this.prisma.$transaction(async (tx) => {
      const client = await tx.apiClient.create({
        data: {
          name: input.clientName,
          orgId: input.orgId ?? null,
          status: ApiClientStatus.active,
        },
        select: { id: true, name: true, orgId: true, status: true },
      });

      const apiKey = await tx.apiKey.create({
        data: {
          clientId: client.id,
          keyPrefix,
          keyHash,
          scopes,
          expiresAt,
        },
        select: { id: true, keyPrefix: true, scopes: true, expiresAt: true },
      });

      return { client, apiKey };
    });

    return {
      apiKey: rawKey,
      apiKeyId: result.apiKey.id,
      clientId: result.client.id,
      clientName: result.client.name,
      orgId: result.client.orgId,
      keyPrefix: result.apiKey.keyPrefix,
      scopes: result.apiKey.scopes,
      expiresAt: result.apiKey.expiresAt,
    };
  }

  async list() {
    const keys = await this.prisma.apiKey.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        keyPrefix: true,
        scopes: true,
        expiresAt: true,
        revokedAt: true,
        lastUsedAt: true,
        createdAt: true,
        client: { select: { id: true, name: true, orgId: true, status: true } },
      },
    });

    return keys.map((key) => ({
      id: key.id,
      keyPrefix: key.keyPrefix,
      scopes: key.scopes,
      expiresAt: key.expiresAt,
      revokedAt: key.revokedAt,
      lastUsedAt: key.lastUsedAt,
      createdAt: key.createdAt,
      client: key.client,
      status: key.revokedAt
        ? 'revoked'
        : key.expiresAt && key.expiresAt.getTime() < Date.now()
          ? 'expired'
          : 'active',
    }));
  }

  async revoke(id: string) {
    const existing = await this.prisma.apiKey.findUnique({
      where: { id },
      select: { id: true, revokedAt: true },
    });
    if (!existing) {
      throw new NotFoundException({
        code: 'API_KEY_NOT_FOUND',
        message: 'API key not found',
      });
    }

    if (existing.revokedAt) {
      return { id, revokedAt: existing.revokedAt };
    }

    const updated = await this.prisma.apiKey.update({
      where: { id },
      data: { revokedAt: new Date() },
      select: { id: true, revokedAt: true },
    });

    return updated;
  }
}

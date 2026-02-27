import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { Claims } from '../auth/claims.type';

type UpsertFromClaimsOptions = {
  touchLastLoginAt?: boolean;
};

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  private pickEmail(claims: Claims): string | null {
    const raw = claims.email;
    if (typeof raw !== 'string') return null;
    const normalized = raw.trim();
    return normalized.length > 0 ? normalized : null;
  }

  private legacyEntraSub(identityUserId: string): string {
    // Keep legacy field populated during additive migration.
    return identityUserId;
  }

  async findByIdentityUserId(identityUserId: string) {
    return this.prisma.user.findUnique({
      where: { identityUserId },
    });
  }

  async upsertFromClaims(
    claims: Claims,
    options: UpsertFromClaimsOptions = {},
  ) {
    const identityUserId = claims.sub;
    const email = this.pickEmail(claims);
    const touchLastLoginAt = options.touchLastLoginAt ?? true;
    const now = touchLastLoginAt ? new Date() : undefined;

    const existingByIdentity = await this.findByIdentityUserId(identityUserId);
    if (existingByIdentity) {
      return this.prisma.user.update({
        where: { id: existingByIdentity.id },
        data: {
          email: email ?? existingByIdentity.email ?? undefined,
          ...(now ? { lastLoginAt: now } : {}),
        },
      });
    }

    if (email) {
      const existingByEmail = await this.prisma.user.findFirst({
        where: { email: { equals: email, mode: 'insensitive' } },
        select: { id: true, identityUserId: true, email: true },
      });

      if (existingByEmail) {
        if (
          existingByEmail.identityUserId &&
          existingByEmail.identityUserId !== identityUserId
        ) {
          throw new ConflictException({
            code: 'IDENTITY_USER_ID_CONFLICT',
            message: 'Email already linked to another identity',
          });
        }

        return this.prisma.user.update({
          where: { id: existingByEmail.id },
          data: {
            identityUserId,
            email,
            ...(now ? { lastLoginAt: now } : {}),
          },
        });
      }
    }

    return this.prisma.user.create({
      data: {
        identityUserId,
        entraSub: this.legacyEntraSub(identityUserId),
        email: email ?? undefined,
        status: claims.globalStatus,
        ...(now ? { lastLoginAt: now } : {}),
      },
    });
  }
}

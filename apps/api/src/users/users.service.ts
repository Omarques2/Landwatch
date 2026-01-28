import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { Claims } from '../auth/claims.type';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  private pickEmail(claims: Claims): string | null {
    // varios IdPs colocam emails como array
    const emails = claims.emails;
    if (Array.isArray(emails) && emails.length) return String(emails[0]);

    const raw =
      claims.email ?? claims.preferred_username ?? claims.upn ?? undefined;
    if (!raw) return null;

    return typeof raw === 'string' && raw.trim().length > 0 ? raw : null;
  }

  async upsertFromClaims(claims: Claims) {
    const entraSub = claims.sub;
    const email = this.pickEmail(claims); // mantenha sua logica atual
    const displayName = claims.name ?? null;

    return this.prisma.user.upsert({
      where: { entraSub: entraSub },
      create: {
        entraSub: entraSub,
        email: email ?? undefined,
        displayName: displayName ?? undefined,
        status: 'active',
        lastLoginAt: new Date(),
      },
      update: {
        email: email ?? undefined,
        displayName: displayName ?? undefined,
        lastLoginAt: new Date(),
      },
    });
  }
}

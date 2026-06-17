import { ConflictException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';

describe('UsersService', () => {
  it('links legacy user by email without creating duplicate user', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({
            id: 'user-1',
            identityUserId: null,
            email: 'user@example.com',
          })
          .mockResolvedValueOnce({
            id: 'user-1',
            identityUserId: '6f8cfca5-cb58-4f83-b7a5-8d1dd43d00d5',
            email: 'user@example.com',
            status: 'active',
          }),
        update: jest.fn().mockResolvedValue({
          id: 'user-1',
          identityUserId: '6f8cfca5-cb58-4f83-b7a5-8d1dd43d00d5',
          email: 'user@example.com',
          status: 'active',
        }),
        create: jest.fn(),
      },
    } as unknown as PrismaService;

    const service = new UsersService(prisma);

    const result = await service.upsertFromClaims({
      sub: '6f8cfca5-cb58-4f83-b7a5-8d1dd43d00d5',
      sid: 'sid-1',
      amr: 'password',
      email: 'user@example.com',
      emailVerified: true,
      globalStatus: 'active',
      apps: [],
      ver: 1,
    });

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-1' },
        data: expect.objectContaining({
          identityUserId: '6f8cfca5-cb58-4f83-b7a5-8d1dd43d00d5',
        }),
      }),
    );
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(result.id).toBe('user-1');
  });

  it('does not UPDATE when email is unchanged and lastLoginAt is not touched', async () => {
    const existing = {
      id: 'user-1',
      identityUserId: '6f8cfca5-cb58-4f83-b7a5-8d1dd43d00d5',
      email: 'user@example.com',
      status: 'active',
    };
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(existing),
        findFirst: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
      },
    } as unknown as PrismaService;

    const service = new UsersService(prisma);

    const result = await service.upsertFromClaims(
      {
        sub: '6f8cfca5-cb58-4f83-b7a5-8d1dd43d00d5',
        sid: 'sid-1',
        amr: 'password',
        email: 'user@example.com',
        emailVerified: true,
        globalStatus: 'active',
        apps: [],
        ver: 1,
      },
      { touchLastLoginAt: false },
    );

    // Hot path (guard): nothing changed → no write/lock issued.
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(result).toBe(existing);
  });

  it('UPDATES when the email changed', async () => {
    const existing = {
      id: 'user-1',
      identityUserId: '6f8cfca5-cb58-4f83-b7a5-8d1dd43d00d5',
      email: 'old@example.com',
      status: 'active',
    };
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(existing),
        findFirst: jest.fn(),
        update: jest
          .fn()
          .mockResolvedValue({ ...existing, email: 'new@example.com' }),
        create: jest.fn(),
      },
    } as unknown as PrismaService;

    const service = new UsersService(prisma);

    await service.upsertFromClaims(
      {
        sub: '6f8cfca5-cb58-4f83-b7a5-8d1dd43d00d5',
        sid: 'sid-1',
        amr: 'password',
        email: 'new@example.com',
        emailVerified: true,
        globalStatus: 'active',
        apps: [],
        ver: 1,
      },
      { touchLastLoginAt: false },
    );

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-1' },
        data: expect.objectContaining({ email: 'new@example.com' }),
      }),
    );
  });

  it('rejects when email is linked to another identity', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue({
          id: 'user-1',
          identityUserId: '11111111-1111-4111-8111-111111111111',
          email: 'user@example.com',
        }),
      },
    } as unknown as PrismaService;

    const service = new UsersService(prisma);

    await expect(
      service.upsertFromClaims({
        sub: '22222222-2222-4222-8222-222222222222',
        sid: 'sid-1',
        amr: 'password',
        email: 'user@example.com',
        emailVerified: true,
        globalStatus: 'active',
        apps: [],
        ver: 1,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('creates new user with local status derived from global status claim', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: 'user-2',
          identityUserId: '33333333-3333-4333-8333-333333333333',
          email: 'pending@example.com',
          status: 'pending',
        }),
      },
    } as unknown as PrismaService;

    const service = new UsersService(prisma);

    await service.upsertFromClaims({
      sub: '33333333-3333-4333-8333-333333333333',
      sid: 'sid-2',
      amr: 'password',
      email: 'pending@example.com',
      emailVerified: false,
      globalStatus: 'pending',
      apps: [],
      ver: 1,
    });

    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'pending',
        }),
      }),
    );
  });
});

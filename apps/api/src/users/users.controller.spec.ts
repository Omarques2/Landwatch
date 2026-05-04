import { UnauthorizedException } from '@nestjs/common';
import type { AuthedRequest } from '../auth/authed-request.type';
import { UsersController } from './users.controller';

describe('UsersController', () => {
  it('returns access-status payload for pending user', async () => {
    const user = {
      id: 'user-1',
      identityUserId: 'identity-1',
      email: 'pending@example.com',
      displayName: null,
      status: 'pending',
      lastLoginAt: new Date('2026-05-04T12:15:31.613Z'),
    };
    const memberships = [
      {
        orgId: 'org-1',
        role: 'viewer',
        org: { name: 'Org 1', slug: 'org-1', status: 'active' },
      },
    ];
    const usersService = {
      upsertFromClaims: jest.fn().mockResolvedValue(user),
      listMemberships: jest.fn().mockResolvedValue(memberships),
    };
    const controller = new UsersController(usersService as never);

    const result = await controller.accessStatus({
      user: { sub: 'identity-1' },
    } as AuthedRequest);

    expect(result).toEqual({
      id: user.id,
      identityUserId: user.identityUserId,
      email: user.email,
      displayName: null,
      status: 'pending',
      lastLoginAt: user.lastLoginAt,
      memberships,
    });
  });

  it('throws unauthorized when claims are missing', async () => {
    const usersService = {
      upsertFromClaims: jest.fn(),
      listMemberships: jest.fn(),
    };
    const controller = new UsersController(usersService as never);

    await expect(
      controller.accessStatus({} as AuthedRequest),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

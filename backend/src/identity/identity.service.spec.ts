import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IdentityService } from './identity.service.js';

describe('IdentityService', () => {
  const password = 'Password123!';
  let passwordHash: string;
  let prisma: {
    user: { findUnique: ReturnType<typeof vi.fn> };
    membership: { findUnique: ReturnType<typeof vi.fn> };
  };
  let jwtService: { signAsync: ReturnType<typeof vi.fn> };
  let service: IdentityService;

  beforeEach(async () => {
    passwordHash = await bcrypt.hash(password, 4);
    prisma = {
      user: { findUnique: vi.fn() },
      membership: { findUnique: vi.fn() },
    };
    jwtService = { signAsync: vi.fn().mockResolvedValue('signed.jwt.token') };
    const configService = {
      getOrThrow: (key: string) => {
        if (key === 'JWT_EXPIRES_IN') return '1h';
        throw new Error(`unexpected key ${key}`);
      },
    };

    service = new IdentityService(
      prisma as never,
      jwtService as unknown as JwtService,
      configService as unknown as ConfigService,
    );
  });

  it('returns a token and membership role for valid credentials', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user_analyst',
      email: 'analyst@demo.reconcileops.local',
      displayName: 'Demo Analyst',
      passwordHash,
      memberships: [{ workspaceId: 'ws_demo', role: 'analyst' }],
    });

    const result = await service.login(
      'analyst@demo.reconcileops.local',
      password,
    );

    expect(result.accessToken).toBe('signed.jwt.token');
    expect(result.user.role).toBe('analyst');
    expect(result.user.workspaceId).toBe('ws_demo');
    expect(jwtService.signAsync).toHaveBeenCalledWith({
      sub: 'user_analyst',
      workspaceId: 'ws_demo',
    });
  });

  it('rejects a wrong password without revealing which field failed', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user_analyst',
      email: 'analyst@demo.reconcileops.local',
      displayName: 'Demo Analyst',
      passwordHash,
      memberships: [{ workspaceId: 'ws_demo', role: 'analyst' }],
    });

    await expect(
      service.login('analyst@demo.reconcileops.local', 'wrong-password'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('loads role from memberships, not from a client-supplied claim', async () => {
    prisma.membership.findUnique.mockResolvedValue({
      userId: 'user_analyst',
      workspaceId: 'ws_demo',
      role: 'analyst',
      user: {
        email: 'analyst@demo.reconcileops.local',
        displayName: 'Demo Analyst',
      },
    });

    const actor = await service.resolveAuthenticatedUser(
      'user_analyst',
      'ws_demo',
    );

    expect(actor.role).toBe('analyst');
    expect(prisma.membership.findUnique).toHaveBeenCalledWith({
      where: {
        workspaceId_userId: {
          workspaceId: 'ws_demo',
          userId: 'user_analyst',
        },
      },
      include: { user: true },
    });
  });
});

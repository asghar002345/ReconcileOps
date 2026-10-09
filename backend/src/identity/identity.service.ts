import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { PrismaService } from '../database/prisma.service.js';
import type {
  AccessTokenPayload,
  AuthenticatedUser,
} from './auth.types.js';

export type LoginResult = {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: string;
  user: AuthenticatedUser;
};

@Injectable()
export class IdentityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async login(email: string, password: string): Promise<LoginResult> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
      include: {
        memberships: {
          where: { workspaceId: 'ws_demo' },
          take: 1,
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const membership = user.memberships[0];
    if (!membership) {
      throw new UnauthorizedException('User has no membership in ws_demo');
    }

    const payload: AccessTokenPayload = {
      sub: user.id,
      workspaceId: membership.workspaceId,
    };
    const expiresIn = this.configService.getOrThrow<string>('JWT_EXPIRES_IN');
    const accessToken = await this.jwtService.signAsync(payload);

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn,
      user: {
        userId: user.id,
        email: user.email,
        displayName: user.displayName,
        workspaceId: membership.workspaceId,
        role: membership.role,
      },
    };
  }

  /**
   * Loads the actor from the database. A role claim in a token or body is ignored.
   */
  async resolveAuthenticatedUser(
    userId: string,
    workspaceId: string,
  ): Promise<AuthenticatedUser> {
    const membership = await this.prisma.membership.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId,
        },
      },
      include: {
        user: true,
      },
    });

    if (!membership) {
      throw new UnauthorizedException('Membership not found for this token');
    }

    return {
      userId: membership.userId,
      email: membership.user.email,
      displayName: membership.user.displayName,
      workspaceId: membership.workspaceId,
      role: membership.role,
    };
  }
}

import type { MembershipRole } from '@prisma/client';

/** Claims stored in the JWT. Role is never trusted from the token alone. */
export type AccessTokenPayload = {
  sub: string;
  workspaceId: string;
};

/** Actor loaded on every protected request from users + memberships. */
export type AuthenticatedUser = {
  userId: string;
  email: string;
  displayName: string;
  workspaceId: string;
  role: MembershipRole;
};

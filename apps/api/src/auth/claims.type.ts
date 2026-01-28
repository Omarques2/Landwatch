import type { JWTPayload } from 'jose';

export type Claims = JWTPayload & {
  sub: string;
  oid?: string;
  preferred_username?: string;
  email?: string;
  upn?: string;
  name?: string;
  emails?: string[];
};

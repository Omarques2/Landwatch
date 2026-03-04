import type { Request } from 'express';
import type { ApiKeyScope } from '@prisma/client';
import type { Claims } from './claims.type';

export type ApiKeyPrincipal = {
  id: string;
  clientId: string;
  orgId: string | null;
  scopes: ApiKeyScope[];
};

export type AuthedRequest = Request & {
  user?: Claims;
  apiKey?: ApiKeyPrincipal;
};

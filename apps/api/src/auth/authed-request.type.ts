import type { Request } from 'express';
import type { ApiClientKind, ApiKeyScope } from '@prisma/client';
import type { Claims } from './claims.type';

export type ApiKeyPrincipal = {
  id: string;
  clientId: string;
  orgId: string | null;
  kind: ApiClientKind;
  scopes: ApiKeyScope[];
};

export type AuthedRequest = Request & {
  user?: Claims;
  apiKey?: ApiKeyPrincipal;
};

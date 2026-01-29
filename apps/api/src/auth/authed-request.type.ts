import type { Request } from 'express';
import type { Claims } from './claims.type';

export type AuthedRequest = Request & {
  user?: Claims;
  apiKey?: {
    id: string;
    clientId: string;
    orgId: string | null;
    scopes: string[];
  };
};

import type { Request } from 'express';
import type { Claims } from './claims.type';

export type AuthedRequest = Request & {
  user?: Claims;
};

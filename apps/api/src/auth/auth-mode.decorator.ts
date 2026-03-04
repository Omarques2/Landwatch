import { SetMetadata } from '@nestjs/common';

export const AUTH_MODE_KEY = 'authMode';

export type AuthMode = 'user' | 'automation';

export const AuthMode = (mode: AuthMode) => SetMetadata(AUTH_MODE_KEY, mode);

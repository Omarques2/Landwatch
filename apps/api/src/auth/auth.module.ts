import { Global, Module } from '@nestjs/common';
import { EntraJwtService } from './entra-jwt.service';
import { AuthGuard } from './auth.guard';
import { ActiveUserGuard } from './active-user.guard';
import { PlatformAdminGuard } from './platform-admin.guard';
import { ApiKeyGuard } from './api-key.guard';

@Global()
@Module({
  providers: [
    EntraJwtService,
    AuthGuard,
    ActiveUserGuard,
    PlatformAdminGuard,
    ApiKeyGuard,
  ],
  exports: [
    EntraJwtService,
    AuthGuard,
    ActiveUserGuard,
    PlatformAdminGuard,
    ApiKeyGuard,
  ],
})
export class AuthModule {}

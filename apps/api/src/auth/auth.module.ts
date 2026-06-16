import { Global, Module } from '@nestjs/common';
import { AuthGuard } from './auth.guard';
import { ActiveUserGuard } from './active-user.guard';
import { PlatformAdminGuard } from './platform-admin.guard';
import { ApiKeyGuard } from './api-key.guard';
import { ActorContextService } from './actor-context.service';
import { AccessService } from './access.service';
import { UsersModule } from '../users/users.module';
import { AutomationAuthController } from './automation-auth.controller';
import { AccessController } from './access.controller';

@Global()
@Module({
  imports: [UsersModule],
  controllers: [AutomationAuthController, AccessController],
  providers: [
    AuthGuard,
    ActiveUserGuard,
    PlatformAdminGuard,
    ApiKeyGuard,
    ActorContextService,
    AccessService,
  ],
  exports: [
    AuthGuard,
    ActiveUserGuard,
    PlatformAdminGuard,
    ApiKeyGuard,
    ActorContextService,
    AccessService,
  ],
})
export class AuthModule {}

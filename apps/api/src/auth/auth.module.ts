import { Global, Module } from '@nestjs/common';
import { AuthGuard } from './auth.guard';
import { ActiveUserGuard } from './active-user.guard';
import { PlatformAdminGuard } from './platform-admin.guard';
import { ApiKeyGuard } from './api-key.guard';
import { UsersModule } from '../users/users.module';
import { AutomationAuthController } from './automation-auth.controller';

@Global()
@Module({
  imports: [UsersModule],
  controllers: [AutomationAuthController],
  providers: [AuthGuard, ActiveUserGuard, PlatformAdminGuard, ApiKeyGuard],
  exports: [AuthGuard, ActiveUserGuard, PlatformAdminGuard, ApiKeyGuard],
})
export class AuthModule {}

import { Module } from '@nestjs/common';
import { PowerBiController } from './powerbi.controller';
import { PowerBiService } from './powerbi.service';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { BiAuthzModule } from '../bi-authz/bi-authz.module';
import { AdminPowerBiController } from './admin-powerbi.controller';
import { AdminPowerBiPagesController } from './admin-powerbi-pages.controller';
import { PowerBiCatalogSyncService } from './powerbi-catalog-sync.service';
import { PowerBiBootstrapSyncService } from './powerbi-bootstrap-sync.service';
import { PowerBiPagesService } from './powerbi-pages.service';

@Module({
  imports: [AuthModule, UsersModule, BiAuthzModule],
  controllers: [
    PowerBiController,
    AdminPowerBiController,
    AdminPowerBiPagesController,
  ],
  providers: [
    PowerBiService,
    PowerBiCatalogSyncService,
    PowerBiPagesService,
    PowerBiBootstrapSyncService,
  ],
  exports: [PowerBiService],
})
export class PowerbiModule {}

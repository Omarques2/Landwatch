import { Module } from '@nestjs/common';
import { AdminRlsController } from './admin-rls.controller';
import { AdminRlsService } from './admin-rls.service';
import { PowerbiModule } from '../powerbi/powerbi.module';
import { RlsRefreshService } from './rls-refresh.service';

@Module({
  imports: [PowerbiModule],
  controllers: [AdminRlsController],
  providers: [AdminRlsService, RlsRefreshService],
})
export class AdminRlsModule {}

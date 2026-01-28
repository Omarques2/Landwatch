import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PowerBiCatalogSyncService } from './powerbi-catalog-sync.service';

@Injectable()
export class PowerBiBootstrapSyncService implements OnModuleInit {
  private readonly logger = new Logger(PowerBiBootstrapSyncService.name);

  constructor(private readonly sync: PowerBiCatalogSyncService) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID) {
      this.logger.log('Skipping Power BI bootstrap sync in test mode.');
      return;
    }

    setTimeout(() => {
      void this.syncAll();
    }, 0);
  }

  private async syncAll() {
    try {
      await this.sync.syncGlobalCatalog({ deactivateMissing: true });
      this.logger.log('Power BI global catalog synced on startup.');
    } catch (err) {
      const message =
        err instanceof Error ? (err.stack ?? err.message) : String(err);
      this.logger.error('Power BI catalog bootstrap sync failed.', message);
    }
  }
}

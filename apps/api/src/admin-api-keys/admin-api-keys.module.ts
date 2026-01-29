import { Module } from '@nestjs/common';
import { AdminApiKeysController } from './admin-api-keys.controller';
import { AdminApiKeysService } from './admin-api-keys.service';

@Module({
  controllers: [AdminApiKeysController],
  providers: [AdminApiKeysService],
})
export class AdminApiKeysModule {}

import { Module } from '@nestjs/common';
import { BiAuthzService } from './bi-authz.service';

@Module({
  providers: [BiAuthzService],
  exports: [BiAuthzService],
})
export class BiAuthzModule {}

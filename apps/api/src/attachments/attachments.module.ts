import { Module } from '@nestjs/common';
import { AttachmentsController } from './attachments.controller';
import { PublicAttachmentsController } from './public-attachments.controller';
import { AttachmentsService } from './attachments.service';

@Module({
  controllers: [AttachmentsController, PublicAttachmentsController],
  providers: [AttachmentsService],
  exports: [AttachmentsService],
})
export class AttachmentsModule {}

import { IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { AttachmentTargetDto } from './attachment-target.dto';

export class AddTargetsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttachmentTargetDto)
  targets!: AttachmentTargetDto[];
}

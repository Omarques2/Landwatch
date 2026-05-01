import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AttachmentTargetDto } from './attachment-target.dto';

const visibilityValues = ['PUBLIC', 'PRIVATE'] as const;

export class CreateAttachmentMetadataDto {
  @IsString()
  categoryCode!: string;

  @IsOptional()
  @IsIn(visibilityValues)
  visibility?: (typeof visibilityValues)[number];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttachmentTargetDto)
  targets!: AttachmentTargetDto[];
}

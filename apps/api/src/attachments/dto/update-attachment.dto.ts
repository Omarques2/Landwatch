import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

const visibilityValues = ['PUBLIC', 'PRIVATE'] as const;

export class UpdateAttachmentDto {
  @IsOptional()
  @IsString()
  categoryCode?: string;

  @IsOptional()
  @IsIn(visibilityValues)
  visibility?: (typeof visibilityValues)[number];

  @IsOptional()
  @IsString()
  @MaxLength(1200)
  note?: string;
}

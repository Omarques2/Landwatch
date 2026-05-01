import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateAttachmentCategoryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1200)
  description?: string;

  @IsOptional()
  @IsBoolean()
  isJustification?: boolean;

  @IsOptional()
  @IsBoolean()
  requiresApproval?: boolean;

  @IsOptional()
  @IsBoolean()
  isPublicDefault?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateAttachmentCategoryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  code!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(180)
  name!: string;

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

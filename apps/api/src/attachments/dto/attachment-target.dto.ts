import {
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateIf,
} from 'class-validator';

const scopeValues = [
  'ORG_FEATURE',
  'ORG_CAR',
  'PLATFORM_FEATURE',
  'PLATFORM_CAR',
] as const;

export class AttachmentTargetDto {
  @IsString()
  @IsNotEmpty()
  datasetCode!: string;

  @IsOptional()
  @IsString()
  featureId?: string;

  @IsOptional()
  @IsString()
  featureKey?: string;

  @IsOptional()
  @IsString()
  naturalId?: string;

  @IsIn(scopeValues)
  scope!: (typeof scopeValues)[number];

  @IsOptional()
  @IsString()
  appliesOrgId?: string;

  @ValidateIf(
    (value: AttachmentTargetDto) =>
      value.scope === 'ORG_CAR' || value.scope === 'PLATFORM_CAR',
  )
  @IsString()
  @IsNotEmpty()
  carKey?: string;

  @IsDateString()
  validFrom!: string;

  @IsOptional()
  @IsDateString()
  validTo?: string;
}

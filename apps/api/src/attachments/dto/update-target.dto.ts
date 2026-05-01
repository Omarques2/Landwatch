import {
  IsDateString,
  IsIn,
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

export class UpdateTargetDto {
  @IsOptional()
  @IsString()
  datasetCode?: string;

  @IsOptional()
  @IsString()
  featureId?: string;

  @IsOptional()
  @IsString()
  featureKey?: string;

  @IsOptional()
  @IsString()
  naturalId?: string;

  @IsOptional()
  @IsIn(scopeValues)
  scope?: (typeof scopeValues)[number];

  @IsOptional()
  @IsString()
  appliesOrgId?: string;

  @ValidateIf(
    (value: UpdateTargetDto) =>
      value.scope === 'ORG_CAR' || value.scope === 'PLATFORM_CAR',
  )
  @IsString()
  carKey?: string;

  @IsOptional()
  @IsDateString()
  validFrom?: string;

  @IsOptional()
  @IsDateString()
  validTo?: string | null;
}

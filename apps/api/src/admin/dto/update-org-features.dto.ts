import { AppFeature } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsIn,
  ValidateNested,
} from 'class-validator';

// Only these tenant-facing features can be toggled per organization. Platform
// features (e.g. attachments) are not configurable here.
export const TENANT_ADMIN_FEATURES = [
  AppFeature.FARMS,
  AppFeature.ANALYSES,
  AppFeature.ANALYSIS_CREATE,
  AppFeature.CAR_SEARCH,
  AppFeature.SCHEDULES,
] as const;

export class OrgFeatureToggleDto {
  // `@IsIn` is the correct validator for a subset of allowed values; `@IsEnum`
  // is meant for a full enum object, not an `as const` array.
  @IsIn(TENANT_ADMIN_FEATURES)
  feature!: AppFeature;

  @IsBoolean()
  enabled!: boolean;
}

export class UpdateOrgFeaturesDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => OrgFeatureToggleDto)
  features!: OrgFeatureToggleDto[];
}

import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { toBoolean } from '../../common/dto/transformers';

export class WorkspaceQueryDto {
  @IsUUID()
  workspaceId!: string;
}

export class EmbedConfigQueryDto {
  @IsUUID()
  workspaceId!: string;

  @IsUUID()
  reportId!: string;
}

export class ExportReportDto {
  @IsUUID()
  workspaceId!: string;

  @IsUUID()
  reportId!: string;

  @IsOptional()
  @Matches(/^(pdf|png)$/i)
  format?: string;

  @IsOptional()
  @IsString()
  bookmarkState?: string;

  @IsOptional()
  @IsString()
  pageName?: string;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  skipStamp?: boolean;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  relaxedPdfCheck?: boolean;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  forceIdentity?: boolean;
}

export class RefreshReportDto {
  @IsUUID()
  workspaceId!: string;

  @IsUUID()
  reportId!: string;
}

export class RefreshStatusQueryDto {
  @IsUUID()
  workspaceId!: string;

  @IsUUID()
  reportId!: string;
}

export class AdminPowerBiSyncDto {
  @IsUUID()
  customerId!: string;

  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  workspaceIds?: string[];

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  deactivateMissing?: boolean;
}

export class AdminPowerBiCatalogQueryDto {
  @IsUUID()
  customerId!: string;
}

export class AdminPowerBiPreviewQueryDto {
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  forceIdentity?: boolean;
}

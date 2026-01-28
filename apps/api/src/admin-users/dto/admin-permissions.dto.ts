import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { toBoolean } from '../../common/dto/transformers';

export class PermissionsListQueryDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

export class SetWorkspacePermissionDto {
  @IsUUID()
  customerId!: string;

  @Transform(toBoolean)
  @IsBoolean()
  canView!: boolean;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  grantReports?: boolean;
}

export class SetReportPermissionDto {
  @IsUUID()
  customerId!: string;

  @Transform(toBoolean)
  @IsBoolean()
  canView!: boolean;
}

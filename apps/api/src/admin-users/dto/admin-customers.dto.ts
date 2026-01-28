import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { toBoolean } from '../../common/dto/transformers';

const CUSTOMER_STATUSES = ['active', 'inactive'] as const;

export class CreateCustomerDto {
  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsIn(CUSTOMER_STATUSES)
  status?: (typeof CUSTOMER_STATUSES)[number];
}

export class UpdateCustomerDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  code?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;
}

export class UpdateCustomerStatusDto {
  @IsIn(CUSTOMER_STATUSES)
  status!: (typeof CUSTOMER_STATUSES)[number];
}

export class UpdateCustomerReportPermissionDto {
  @Transform(toBoolean)
  @IsBoolean()
  canView!: boolean;
}

export class UpdateCustomerWorkspacePermissionDto {
  @Transform(toBoolean)
  @IsBoolean()
  canView!: boolean;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  restoreReports?: boolean;
}

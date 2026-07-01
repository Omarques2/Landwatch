import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class ListAnalysesQuery {
  @IsOptional()
  @IsString()
  carKey?: string;

  @IsOptional()
  @IsUUID()
  farmId?: string;

  // Operator-only filter to a single org. Ignored by the service for
  // non-operator tenants.
  @IsOptional()
  @IsUUID()
  orgId?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

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

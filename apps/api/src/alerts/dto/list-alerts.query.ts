import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { AnalysisAlertStatus } from '@prisma/client';

export class ListAlertsQuery {
  @IsOptional()
  @IsEnum(AnalysisAlertStatus)
  status?: AnalysisAlertStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

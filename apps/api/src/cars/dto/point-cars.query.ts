import { Type } from 'class-transformer';
import { IsISO8601, IsNumber, IsOptional, Max, Min } from 'class-validator';

export class PointCarsQuery {
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng!: number;

  @IsOptional()
  @IsISO8601()
  analysisDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  tolerance?: number;
}

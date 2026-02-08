import { Type } from 'class-transformer';
import {
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class ByKeyCarsQuery {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  carKey!: string;

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

import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class SearchFeaturesDto {
  @IsArray()
  @IsString({ each: true })
  datasetCodes!: string[];

  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @IsOptional()
  @IsString()
  carKey?: string;

  @IsOptional()
  @IsBoolean()
  intersectsCarOnly?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number;

  @IsOptional()
  @IsString()
  cursor?: string | null;

  @IsOptional()
  @IsBoolean()
  includeGeometry?: boolean;
}

import {
  IsArray,
  IsInt,
  IsISO8601,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';

export class CreateRadiusAnalysisDto {
  @IsLatitude()
  lat!: number;

  @IsLongitude()
  lng!: number;

  @IsInt()
  @Min(100)
  @Max(5000)
  radiusMeters!: number;

  @IsString()
  @Length(2, 200)
  name!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Length(11, 18, { each: true })
  documents?: string[];

  @IsOptional()
  @IsISO8601()
  analysisDate?: string;
}

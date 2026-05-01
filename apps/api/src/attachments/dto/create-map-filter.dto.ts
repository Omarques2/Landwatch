import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateMapFilterDto {
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
}

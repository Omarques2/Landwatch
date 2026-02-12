import {
  IsEnum,
  IsArray,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Length,
} from 'class-validator';
import { AnalysisKind } from '@prisma/client';

export class CreateAnalysisDto {
  @IsString()
  @Length(5, 200)
  carKey!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Length(11, 18, { each: true })
  documents?: string[];

  @IsOptional()
  @IsUUID()
  farmId?: string;

  @IsOptional()
  @IsString()
  @Length(2, 200)
  farmName?: string;

  @IsOptional()
  @IsISO8601()
  analysisDate?: string;

  @IsOptional()
  @IsEnum(AnalysisKind)
  analysisKind?: AnalysisKind;
}
